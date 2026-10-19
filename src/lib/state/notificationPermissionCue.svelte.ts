class NotificationPermissionCueState {
  visible = $state(false);

  show(): void {
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}

export const notificationPermissionCue = new NotificationPermissionCueState();
