# TruckBook – Dump Truck Manager

An independent, offline-first Android app (and browser app) for dump-truck owners: log trips, fuel and repairs, pay drivers, invoice customers and see the profit of every truck. It also includes simple cash books for everything else. It is a separate app from CashBook: its own name, package id (`com.truckbook.fleet`), signing key, icon, phone storage and database, so both can be installed on the same phone without touching each other.

## Features

- **Dump-truck fleet management** (Trucks tab), separate from your cash books:
  - **Trucks**: plate, make/model, capacity, usual driver, and reminders 30 days before insurance, inspection and service dates; mark a truck "not in use" without losing its history
  - **Simpler screens (1.10.0):** a **Getting started** checklist for new owners (fleet, truck, driver, first work); the book picker in the top bar shows only on the Entries tab; the Work list has one compact filter row and a **More…** menu for exports; the duplicate Drivers view under a fleet's Cash section is gone (use the Driver Account tab); the fleet's old Drivers section is renamed **Wages** (attendance and pay).
  - **Receipt photos and driver statement (1.9.0):** any cash entry can carry receipt photos (shown as 📎 in the driver's ledger; photos stay on the phone, like bill photos). **Driver statement** shows every row that touches a driver with the cash he holds after each one, plus wages, loans and the net position; print/share or export to CSV.
  - **Relief drivers, cash count and alerts (1.8.0):** a truck can have dated relief drivers; while one covers, new work defaults to him and his attendance is charged to that truck. In the Driver Account tab, **Count cash** compares the cash a driver holds with the book: a shortage is charged to the truck as a cost (and can be taken from his salary), an overage is only recorded for you to investigate. A **Needs attention** list shows: money held for 3+ days with no handover or return, customer money not handed over, a driver holding over ETB 10,000, a cash count that was off, fuel use well above the truck's own usual, a truck with no work for 3 days, and jobs not invoiced after 14 days. These limits are starting values to tune after the field test; **Reviewed** hides an alert for 7 days on that phone.
  - **Every truck has its own cash book (1.7.0):** adding or editing a truck requires an answer to "Who is responsible for this truck?" (a driver, I drive it myself, hired out with the other side's operator, or no regular driver); a new driver can be typed in the same form. A truck or machine can be marked own or rented in, and given an opening cash balance. The **Cash book** button on each truck shows opening, money in, money out and closing for any period, built from the same rows as the driver accounts. Trucks with history are retired instead of deleted (the cash book and history stay). Older trucks with no choice yet show an amber banner and are treated as having no regular driver until the owner chooses.
  - **Data safety (1.6.0):** a truck's driver is stored in one place and the driver's usual truck follows it; a driver who is a truck's responsible driver, or who has cash, attendance or collection records, cannot be deleted; deleted cash entries can be restored from Recently deleted; weekly wages are charged to the truck the driver was on each day.
  - **Driver Account** tab: one card per driver. Money in: payments collected from customers (held by the driver until handed over), change returned, loans repaid. Truck expenses: trip money given and what the driver spent (fuel, toll, food; charged to the truck). Driver expenses: trip allowance (a cost) and personal loans (not a cost; owed back in cash or taken off salary). Wages: pay, salary earned, deductions. The summary shows cash held by drivers, collected-not-handed-over, loans outstanding and wages owed; all flow into the four financial statements. Settings moved to the ⚙️ button in the top bar.
  - **Work** tab (the old Trips): six types of work — trip, load by volume (m³), load by weight (tonnes), and rent by the hour, day or month. Hours come from the hour meter, days from the start and end dates; rent entries record who pays the fuel. Each entry has truck or machine, driver or operator, customer, place, material, ticket number and a pay-on-the-spot option; filter by truck, customer or invoiced/not invoiced; income by type of work in the income statement; print or export to CSV
  - **Fuel, repairs and bills**: add fuel (with litres and odometer), repairs/service, spare parts, tyres, insurance and other costs to a truck; paid now (posts a cash-out entry in a linked book) or on credit (a supplier bill with part payments and a "who you owe" list)
  - **Customers and invoices**: an invoice takes a customer's trips that are not invoiced yet, tracks Draft → Sent → Paid, records payments received (into a linked book), prints on A4 and exports to Excel with live formulas; per-customer balances and statements
  - **Cash in / cash out (Cash tab)**: a daily cash summary, a cash book per truck, and a cash account per driver (trip money given, what the driver spent, change returned, salary, wages paid, deductions) with a running balance; entries can post to a linked cash book, and driver spending counts as a truck cost
  - **Financial statements (Trucks → Overview)**: income statement, cash flow, balance sheet and ageing of what customers owe you and you owe suppliers, for any period, with print and CSV. Money a driver collects from a customer is held by the driver until he hands it over
  - **Fuel report**: price per litre and its change over time, litres per 100 km and cost per km from the odometer on fuel bills; a warning when a trip's load is above the truck's capacity (when both are in tons or m³)
  - **Drivers and helpers**: daily rates, attendance by day, weekly wages that post to your costs, and a driver statement
  - **Profit per truck**: income, costs, litres of fuel and profit for every truck, plus fleet income, costs, profit and margin on the Overview; costs not tagged to a truck are shown separately
  - **Linked cash books**: link one or more cash books to a fleet so real cash and fleet costs agree
  - **Cash forecast**: expected customer payments and what you must pay (bills, drivers' wages) over the next 30 days
  - **Share a fleet** online (view only or can edit) and **photos** of trucks, documents, cash entries and bills, stored on the phone
  - Fleet report export (CSV) and a printable fleet statement
- **Multiple cashbooks** (Shop, Home, Project…), each with its own balance
- **Add, edit and delete entries** (tap an entry to edit it)
- **Search and filters** by category, remark, type and date range
- **Reports**: monthly totals, cash in/out by category, and a 6-month chart
- **Backup and restore**: save all data to a `.json` file and load it on another phone; CSV files can be imported into the current book. Photos are backed up separately (Settings → Backup photos) and restored with the same Restore button
- **Export** the current book to CSV (saved to Downloads)
- **Dark mode** (follows the system, or choose light/dark)
- **PIN lock** (4–8 digits; locks again when you leave the app)
> The Afaan Oromoo and Amharic text should be checked by a native speaker (`web/i18n.js`, `web/i18n-projects.js`, `web/i18n-more.js`, `web/i18n-fleet.js`).
> The PIN is a simple lock for casual privacy, not strong encryption.

## New in 2.0

- **Contacts** (customers and suppliers), picked from your phone book or typed in: attach one to any cash-book entry and search entries by contact name or phone (the separate Contacts tab was replaced by the Work tab)
- **Entry filters** by contact, payment mode (cash, bank, mobile money, cheque), member (who recorded it) and category
- **Businesses**: group books under several businesses, each with its own staff list and roles (manager, accountant, cashier, viewer)
- **Reminders** for supplier bills (with an optional due date), unpaid or late customer invoices, drivers' unpaid wages, and truck insurance / inspection / service dates
- **Report export** (Excel) for any date range
- **Excel exports**: the customer invoice has live formulas (trip lines, received, balance)
- Staff roles inside a business are a directory. Access to a book is still controlled by sharing that book (edit or view).

## The Entries tab (2.2)

The Entries tab opens on a list of your books, newest change first: a business switcher with a staff button, sort (last updated, name, balance), book search, an "Add new book" card, and one row per book with its balance and last update date. Tap a row to open that book's entries (the arrow or the Entries tab brings you back). The three-dot menu on each row has rename, export, share with people, link to a project, move to a business and delete.

## Install the APK

The APK is built automatically by GitHub Actions.

1. Open the **Actions** tab of this repo and choose the latest **Build APK** run
2. Download the **TruckBook-apk** artifact (a zip containing `TruckBook.apk`)
3. Unzip it on your phone and open `TruckBook.apk`; allow "Install unknown apps" if Android asks

To publish a downloadable release, push a tag such as `v1.5`: the workflow attaches `TruckBook.apk` to that release. You can also run a build manually from the Actions tab.

### Updating

Builds are signed with a fixed key (`app/truckbook.keystore`), so a new APK installs over the old one and keeps your data. This key is public in the repo on purpose: it is for sideloading your own build only, not for app stores.

> Updating from 1.1 or 1.2 to 1.5 keeps all your data. Versions before 1.1 were signed with a throwaway key. To move from one of those, **export your data first** (Settings → Export this book, per book), uninstall the old app, install 1.1, then use **Restore from file** to import the CSV.

## Camera and calculator (2.12)

- **Add photo** now asks **Take a photo** (opens the camera) or **Choose from gallery**.
- Entries have a 🧮 button next to Amount: a calculator for things like `12×350+1500` (brackets, %, decimals). **Use result** fills the amount. The same button appears next to every number field in forms (payments, receipts, rates).

## Never lose your data (2.8)

- **Back up everything** (Settings → Data) saves one `.json` file with all books, projects, contacts **and photos**. On a new phone use **Restore from a backup file**. Old backup files and the separate photo file still restore.
- The app shows a reminder on the Books screen when there has been no backup for 7 days (or ever). “Later” hides it for a day.
- Before a restore the current data is kept on the phone: **Undo last restore** brings it back.
- **Recently deleted**: deleted entries, trips, trucks, bills, invoices, contacts, fleets and books stay recoverable for 30 days (Settings → Data), and a “Deleted · Undo” message appears right after each deletion. Photos of deleted items are kept until the item is deleted for good.
- The trash is local to the phone and is not synced online. Restored books come back as local copies.

## Build locally

Needs JDK 17, the Android SDK and Gradle 8.7:

```bash
gradle assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

| Path | Purpose |
| --- | --- |
| `web/` | The app itself (`index.html`, `style.css`, `app.js`, `logic.js`, `print.js`, `photos.js`, `i18n*.js`), also runnable in a browser |
| `app/` | Android wrapper (a WebView that loads `web/` from the APK) |
| `.github/workflows/build-apk.yml` | Builds the APK on every push |

To try the web version only, open `web/index.html` in a browser.

## Notes

This is an independent project and is not affiliated with any commercial cashbook, fleet or wallet app.

## Online backup and sharing: one-time setup (about 5 minutes)

The app has no server of its own. You create a free Firebase project that belongs to you, and every person who shares books uses the same project.

1. Go to <https://console.firebase.google.com>, sign in with Google, **Add project** (turn Google Analytics off).
2. **Build → Authentication → Get started → Email/Password → Enable → Save.**
3. **Build → Realtime Database → Create database** (pick any location, start in locked mode). Copy the database URL shown at the top, like `https://yourproject-default-rtdb.firebaseio.com`.
4. In Realtime Database open the **Rules** tab, replace everything with the contents of [`firebase-rules.json`](firebase-rules.json) (also shown in the app under *Show database rules*) and **Publish**.
5. **Project settings (gear) → General → Your apps → Web (`</>`)** and register an app; copy the `apiKey` value.
6. In TruckBook go to Settings → Online backup, enter the database URL, the Web API key, your email and a password, and tap **Create account**. Other people use the same URL and key with their own email.

To give every user the connection automatically, put the database URL and Web API key in `web/cloud-config.js` before building, so people only enter an email and password. Leave them empty to make users enter them under Advanced.

To share a book: open it, Settings → **Share this book**, pick *View only* or *Can edit*, **Create invite code**, and send the code. The other person signs in and pastes it under **Join a shared book**.

Notes: the free Firebase plan is plenty for cash books. Anyone with your database URL and key can try to create an account, so only give them to people you trust, and you can turn sign-ups off or delete users in the Firebase console. Online backup keeps the latest copy only.

**Update the rules once more for v1.7:** replace the Realtime Database rules with the new `firebase-rules.json` (it adds the `users` section for profiles and the list of your books) and Publish. Without this, signing up works but profiles and syncing to a second phone are refused.

## Google sign-in (Android app)

"Continue with Google" appears on the sign-in screen in the Android app. It needs, in Firebase: Authentication → Sign-in method → **Google** enabled, and an **Android app** registered with package `com.nhahmed.cashbook` and the SHA-1 of `app/truckbook.keystore` (`keytool -list -v -keystore app/truckbook.keystore -alias cashbook -storepass cashbook-sideload`). The Web client ID of the Google provider is set in `web/cloud-config.js`. A Google account with the same email as an existing email/password account is the same account in CashBook. Phone (SMS) two-factor is not supported yet.

## 1.0.0 – a new, independent app

TruckBook started from the CashBook code and keeps its cash books, contacts, reminders, reports, backup, PIN, calendar, languages and online sync, but it is a different app:

- **Own identity**: name TruckBook, package id `com.truckbook.fleet`, new signing key (`app/truckbook.keystore`), truck icon, and its own storage on the phone, so it never reads or overwrites CashBook data. Backup files are named `truckbook-*`.
- **Own online database**: `web/cloud-config.js` is empty. Follow "Online backup and sharing" below with your own Firebase project and paste its database URL and Web API key (and, optionally, the Google client ID). Until then everything works offline and Settings → Online backup says what is missing.
- **Dump-truck fleet management instead of construction projects**: trucks, trips, fuel and repairs, drivers, customer invoices and profit per truck (see Features). There is no bill of quantities, payment certificate, variation order, budget or site diary.
- **Cost codes**: fuel, spare parts, tyres, repairs and service, driver pay, insurance and licence, permits and fees, overhead, other. A cash-out entry in a linked book can be tagged to a truck.
- To bring over data from CashBook, use its backup file: **Restore from a backup file** keeps cash books and contacts; old projects are converted (supplier bills and workers are kept, BoQ and certificates are dropped).
- Database rules (`firebase-rules.json`) are the same as before and work for any new Firebase project.
