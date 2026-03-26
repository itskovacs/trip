# TravelThing

AI-powered trip planner built on [itskovacs/trip](https://github.com/itskovacs/trip).

## Features

- Day-by-day itinerary with interactive map
- Restaurant info with signature dishes
- Weather forecasts per day
- Budget tracking with category breakdown
- Flight, hotel, and rental car reservations
- Google Maps directions for each day
- Packing lists and pre-trip checklists
- Travel info (visa, emergency contacts)
- Calendar export (.ics)
- Route optimization
- Cost settlement for group trips
- Claude Code skill for one-shot trip planning

## Quick Start

```bash
git clone https://github.com/candogruyol/trip.git travelthing
cd travelthing
docker-compose up -d
```

Open http://localhost:8080 and register your first account.

## Production Deployment

```bash
# Generate a secret key
openssl rand -hex 32

# Create .env
echo "SECRET_KEY=your-generated-key" > .env

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

For HTTPS, put a reverse proxy (Caddy or nginx) in front on port 443.

## Credits

Built on the excellent [TRIP](https://github.com/itskovacs/trip) project by itskovacs.
