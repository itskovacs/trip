---
sidebar_position: 3
description: Setting up your GMaps API Key
---

# Google Maps API Key

:::important
A Google account is mandatory to proceed.
:::

The steps are pretty straightforward:

- Step 1: Sign in to Google Cloud Console (see https://console.cloud.google.com/) with your Google account.

- Step 2: Create or select a project  
  Click the project drop-down menu on the top bar. Select an existing project or click New Project to create a new one.  
  Enter a project name and optionally select an organization.  
  Click **Create**.

- Step 3: Enable billing on the project  
  Open the Billing page (see https://console.cloud.google.com/project/_/billing/enable) and link a billing account to your project.

:::warning
Billing is **mandatory**, even if your usage stays within Google's free tier. Without it, requests fail with: `You must enable Billing on the Google Cloud Project at https://console.cloud.google.com/project/_/billing/enable`.

Each Google Maps Platform API includes a free monthly usage allowance (e.g 10,000 *Places* requests) see [pricing](https://developers.google.com/maps/billing-and-pricing/pricing)).
:::

- Step 4: Create API credentials (API Key)  
  Navigate to the Credentials tab (under _APIs & services_) in the left sidebar.  
  Click **Create Credentials** and select **API key**. A new API key will be generated and displayed.

- Step 5: Use the API Key in TRIP
  Add the API key in your [Settings - Account](../map-tracker/settings#account).

:::tip
For security, you can restrict the Google API Key to your IP/domain
:::

:::warning
Make sure these APIs are **enabled**:

1. _Places API (New)_: https://console.cloud.google.com/apis/library/places.googleapis.com
2. _Places API (Legacy)_: https://console.cloud.google.com/apis/library/places-backend.googleapis.com
3. _Geocoding API_: https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com
4. _Routes API_: https://console.cloud.google.com/apis/library/routes.googleapis.com

:::
