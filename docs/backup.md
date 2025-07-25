TRIP uses SQLite databases to store the data.

To back up your data, follow these simple steps:
1. **Stop the container**
```bash
# Look for TRIP container
$ docker ps

$ docker stop <trip_container_id>
```

2. **Copy the SQLite database file**
```bash
$ cp /path/to/trip/storage/trip.sqlite /path/to/backups/trip.sqlite.bak
```

3. **Restart the container**

> [!TIP]
> To restore your data, simply copy the `trip.sqlite` file back into the `storage` directory.