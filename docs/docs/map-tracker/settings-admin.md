---
sidebar_position: 8
description: Manage users, configure the app, make full backups
---

# Settings - Admin

:::note[TL;DR]
Admin UI allows you to manage users, update the app configuration, make full backups.
:::

:::info
First user registered will be set admin.
:::

The admin UI is accessible through the [Settings - About](settings#about)

### Users

<img src="/trip/img/settings_admin_users.png" alt="Users tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-1rem' }} />

:::tip
If registration is disabled, you can create _Magic Link_ that will allow someone to register. They are valid for 24 hours or until first use.
:::

Manage users, monitor key metrics, reset passwords or permanently delete a user's account.

:::warning
Account deletion is **irreversible** and will completely erase all of their associated data, including trips, places, images, and attachments.
:::

<br />

### Config

<img src="/trip/img/settings_admin_config.png" alt="Config tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-3rem' }} />

View and modify TRIP global configuration. Any adjustments you make to these configurations are applied and **reflected immediately**.

:::tip
While you can update global default values here to affect various aspects of the platform, these changes will not override any existing preferences of individual users.
:::

<br />

### Data

<img src="/trip/img/settings_admin_data.png" alt="Data tab" style={{ width: '400px', float: 'right', marginLeft: '1rem', marginTop: '-1rem' }} />

The **Data** section allows you to generate a complete backup of TRIP data, including all images, attachments, and the database itself.

:::tip
Because the backup is a simple folder tree, it must be restored manually by extracting the archive directly into your data directory.
:::
