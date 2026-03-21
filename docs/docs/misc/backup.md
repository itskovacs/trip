---
sidebar_position: 1
description: Backup and Restore your data
---

# Backup and Restore

:::warning
This procedure assumes you know the storage directory path or have not modified it from the default
:::

:::danger[use your values]
Modify what is between `< >`
:::

:::tip
You can create a full backup archive in the [admin](/docs/map-tracker/settings-admin#data) interface. User-scoped backup can be created and restored using the [settings interface](/docs/map-tracker/settings#data).
:::

TRIP stores data in the `storage` directory by default, including a SQLite database and related folders.

## Backup

To back up your data, follow these simple steps:

1. **Stop the container**

```bash
# Look for TRIP container
$ docker ps

$ docker stop <trip_container_id>
```

2. **Create a backup archive of the storage directory**

```bash
zip -r <date>_TRIP_backup.zip <path/to/storage>
```

3. **Restart the container**

## Restore

:::danger
Ensure the container is not running before restoring
:::

1. **Extract the backup archive to the storage directory**

```bash
$ unzip <date>_TRIP_backup.zip -d <path/to/storage>
```

2. **Start the container**
