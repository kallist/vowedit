import { initializeStorage } from "./storage";
async function initialize() {
  try {
    await initializeStorage();
    if (!chrome.sidePanel?.setPanelBehavior)
      throw new Error("SIDE_PANEL_UNAVAILABLE");
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.storage.local.remove("startupError");
  } catch {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setTitle({
      title: "VowEdit side panel unavailable. Update your browser.",
    });
  }
}
chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});
chrome.runtime.onStartup.addListener(() => {
  void initialize();
});
void initialize();
