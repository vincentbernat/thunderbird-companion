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
  // Notification for new messages
  const folders = ["/INBOX", "/Notifications/GitHub"];
  messenger.messages.onNewMailReceived.addListener(async (folder, messages) => {
    for await (let message of iterateMessagePages(messages)) {
      if (message.read) continue;
      if (!folders.includes(folder.path)) continue;
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
}

document.addEventListener("DOMContentLoaded", load);
