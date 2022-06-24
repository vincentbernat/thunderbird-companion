// A wrapper function returning an async iterator for a MessageList. Derived from
// https://webextension-api.thunderbird.net/en/91/how-to/messageLists.html
async function* iterateMessagePages(page) {
  for (let message of page.messages) {
    yield message;
  }

  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    for (let message of page.messages) {
      yield message;
    }
  }
}

async function load() {
  // ## Notification for new messages
  // This is unreliable until https://bugzilla.mozilla.org/show_bug.cgi?id=1775493 is fixed.
  messenger.messages.onNewMailReceived.addListener(async (folder, messages) => {
    const folderInfo = await messenger.folders.getFolderInfo(folder);
    if (!folderInfo.favorite) return;
    for await (let message of iterateMessagePages(messages)) {
      if (message.read) continue;
      await messenger.notifications.create(
        `TBC-NewMail: ${message.headerMessageId}`,
        {
          type: "basic",
          title: `${folder.path.slice(1)}, from ${message.author}`,
          message: message.subject,
          iconUrl: "images/thunderbird.png",
        }
      );
    }
  });
  // Cannot open the new email until https://bugzilla.mozilla.org/show_bug.cgi?id=1603489 is solved.
  messenger.notifications.onClicked.addListener(async (id) => {
    if (!id.startsWith("TBC-NewMail: ")) return;
    const mid = id.slice("TBC-NewMail: ".length);
    const messages = await messenger.messages.query({ headerMessageId: mid });
    for await (let message of iterateMessagePages(messages)) {
      console.info(
        `Should have opened message from ${message.author}, subject ${message.subject}`
      );
    }
  });

  // ## Go to next unread folder
  messenger.commands.onCommand.addListener(async (command) => {
    if (command !== "next-unread-folder") return;
    const tab = await messenger.mailTabs.getCurrent();
    if (!tab || !tab.displayedFolder) return;
    const accounts = await messenger.accounts.list();
    let folders = [];
    for (let account of accounts) {
      const accountFolders = await messenger.folders.getSubFolders(account);
      const subFolders = (folders) =>
        folders
          .map((folder) =>
            folder.type !== "archives"
              ? [folder, ...subFolders(folder.subFolders)]
              : []
          )
          .flat(1);
      folders = [...folders, ...subFolders(accountFolders)];
    }
    folders.sort((f1, f2) => {
      if (f1.accountId < f2.accountId) return -1;
      if (f1.accountId > f2.accountId) return 1;
      if (f1.path < f2.path) return -1;
      if (f1.path > f2.path) return 1;
      return 0;
    });
    const current = folders.findIndex(
      (f) =>
        f.accountId === tab.displayedFolder.accountId &&
        f.path === tab.displayedFolder.path
    );
    const next = current + 1 >= folders.length ? 0 : current + 1;
    folders = [...folders.slice(next), ...folders.slice(0, next)];
    // Find first folder with unread messages
    for (let folder of folders) {
      const folderInfo = await messenger.folders.getFolderInfo(folder);
      if (folderInfo.unreadMessageCount > 0) {
        await messenger.mailTabs.update(tab.id, { displayedFolder: folder });
        return;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", load);
