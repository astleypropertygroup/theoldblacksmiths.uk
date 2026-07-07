# The Old Blacksmiths Website Launch Checklist

## Before Going Live

- Choose and connect the official domain name.
- Add the live website address to `robots.txt`, social sharing metadata, and any future sitemap.
- Keep Airbnb and Booking.com calendar feed URLs as private server environment variables, not inside public website files.
- Review the Privacy Policy and Booking Terms before publishing.
- Replace any draft wording if you want stricter house rules, cancellation terms, check-in times, or payment instructions.

## Hosting Notes

- The website needs to run through `server.mjs` for the live availability calendar and deals signup to work.
- The host must support Node.js and private environment variables.
- Required private environment variables:
  - `AIRBNB_ICAL_URL`
  - `BOOKING_ICAL_URL`
- Optional environment variables:
  - `PORT`
  - `CALENDAR_CACHE_MS`

## Ongoing Checks

- Test the availability calendar after every calendar feed change.
- Export the mailing list regularly from `data/deal-signups.json`.
- Check the Airbnb and Booking.com review links after publishing.
- Add Google Business Profile, Google Analytics, or Search Console later if you want tracking and search reporting.
