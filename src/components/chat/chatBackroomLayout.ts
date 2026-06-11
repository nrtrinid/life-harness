export const CHAT_BACKROOM_SIDE_BREAKPOINT = 1200;
export const CHAT_MIN_COLUMN_WIDTH = 480;
export const CHAT_BACKROOM_PANEL_WIDTH = 320;
export const APP_SHELL_SIDEBAR_WIDTH = 220;

export function shouldUseChatBackroomSideLayout(windowWidth: number): boolean {
  if (windowWidth < CHAT_BACKROOM_SIDE_BREAKPOINT) {
    return false;
  }
  const sidebarVisible = windowWidth >= 900;
  const reserved = sidebarVisible ? APP_SHELL_SIDEBAR_WIDTH : 0;
  const chatColumn = windowWidth - reserved - CHAT_BACKROOM_PANEL_WIDTH - 24;
  return chatColumn >= CHAT_MIN_COLUMN_WIDTH;
}
