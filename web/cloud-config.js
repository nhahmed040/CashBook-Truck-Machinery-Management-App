/* Connection to your own Firebase project (optional: only needed for online backup and sharing).
   These values are identifiers, not passwords: the database rules decide who can read or write what.
   TruckBook has its own database, separate from any other app. Until you fill these in the app works
   fully offline and the Online settings explain what is missing. See "Online backup and sharing" in the README.
   You can also enter the first two under Settings -> Online backup -> Advanced. */
window.CB_CLOUD_DEFAULTS = {
  dbUrl: '',
  apiKey: '',
  // Web client ID of the Google provider (Firebase -> Authentication -> Sign-in method -> Google). Android app only.
  googleClientId: ''
};
