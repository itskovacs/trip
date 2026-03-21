---
sidebar_position: 7
description: Customize your app experience, manage categories, make backups, enable TOTP, and more.
---

# Settings

:::note[TL;DR]
Customize your app experience, manage categories, make backups, enable TOTP, and more.
:::

:::info
Changes you make will only affect your personal account and will be applied immediately.
:::

### About

<img src="/trip/img/settings_about.png" alt="About tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-2rem' }} />

**About** section has shortcuts to documentation, to contribution to support TRIP development, to the data tab or to the [admin UI](settings-admin) (if user is admin).

:::tip
When toggling dark mode, if the map tile provider wasn't changed manually, it will automatically update to the corresponding dark or light version.
:::

<br />

### Account

<img src="/trip/img/settings_account.png" alt="Account tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-2rem' }} />

The **Account** section handle two topics: **Security** and **Integrations**.

- Update your password, enable Two-Factor Authentication (TOTP) for enhanced security.
- Select your default provider, set your Google API Key to access Google API features within the app, and generate your [TRIP API Key](/docs/trip-api/generating-api-key) to script some tasks.

<br />

### Preferences

In **Preferences**, you can set your default map parameters, such as the initial latitude and longitude, and choose your preferred tile layer provider. You can also update the currency setting to suit your regional or personal preferences.

<img src="/trip/img/settings_preferences.png" alt="Preferences tab" style={{ width: '400px', float: 'right', marginLeft: '1rem' }} />

- **Low Network Mode**:
  Enabled by default, this mode displays category images instead of individual place images to reduce network load by avoiding multiple picture downloads.

- **GPX Indication**:
  Disabled by default. When enabled, an icon appears in the place bubble if a GPX file is associated to that place.

- **Show Visited Places**:
  Disabled by default, always display visited places as small dots.

- **Store Map Position**:
  Disabled by default, encode map position in the URL to restore the same view on refresh.

- **Filter Default Categories**:  
   By default, no categories are hidden. You can customize this to automatically hide certain categories and reduce map clutter.

### Categories

<img src="/trip/img/settings_categories.png" alt="Categories tab" style={{ width: '400px', float: 'right', marginLeft: '1rem' }} />

Manage and customize your place categories in this section. Categories help you organize and filter your points of interest on the map for easier navigation.

:::note
A category consists of a name, a color, and optionally an image.
:::

You can edit, delete, or create new categories. Upon registration, the default categories are:

- Nature & Outdoor
- Entertainment & Leisure
- Culture
- Food & Drink
- Adventure & Sports
- Festival & Event
- Wellness
- Accommodation

### Data

<img src="/trip/img/settings_backups.png" alt="Data tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-3rem' }} />

The **Data** section allows you to save and restore your data, ensuring your places, trips, and preferences are safely stored and recoverable when needed.
