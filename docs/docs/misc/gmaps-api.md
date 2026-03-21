---
sidebar_position: 3
description: Settings up your GMaps API Key
---

# Google Maps API Key

:::warning
A Google account is mandatory to proceed.
:::

The steps are pretty straigtforward:

- Step 1: Sign in to Google Cloud Console (see https://console.cloud.google.com/) with your Google account.

- Step 2: Create or select a project  
  Click the project drop-down menu on the top bar. Select an existing project or click New Project to create a new one.  
  Enter a project name and optionally select an organization.  
  Click **Create**.

- Step 3: Create API credentials (API Key)  
  Navigate to the Credentials tab (under _APIs & services_) in the left sidebar.  
  Click Create Credentials and select API key. A new API key will be generated and displayed.

:::tip
Optionally restrict your API Key to your IP/domain for security
:::

- Step 4: Use the API Key in TRIP
  Add the API key in your [Settings - Account](../map-tracker/settings#account).

:::important
Ensure that the following API are _enabled_

- _Places API (New)_: https://console.cloud.google.com/apis/library/places.googleapis.com
- _Places API (Legacy)_: https://console.cloud.google.com/apis/library/places-backend.googleapis.com
- _Geocoding API_: https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com
- _Routes API_: https://console.cloud.google.com/apis/library/routes.googleapis.com

:::
