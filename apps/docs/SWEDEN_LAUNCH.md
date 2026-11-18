# Launching Negotiate Taxi in Sweden
 
> **Not legal advice.** This is a research summary written from public Swedish sources in November 2026. Rules change (the government has asked Transportstyrelsen to review taxi price-information rules). Confirm everything with a Swedish transport and tax lawyer and with Transportstyrelsen before launch.
 
## 1. Who regulates what
 
| Authority | Role |
|---|---|
| **Transportstyrelsen** (Swedish Transport Agency) | Taxi traffic permits (taxitrafiktillstånd), driver licences (taxiförarlegitimation), taximeters, price information, permits for booking centrals (beställningscentraler) and accounting centrals (redovisningscentraler) |
| **Skatteverket** (Tax Agency) | Tax control of taxi, VAT, platform income reporting (DAC7, KU90) |
| **Konsumentverket** (Consumer Agency) | Consumer rules on price information and complaints |
| **IMY** (Data Protection Authority) | GDPR, location data, automated decisions |
 
Note: **Trafikverket** (road administration) is not the taxi regulator.
 
## 2. How price and tax information reaches the authorities
 
There is no live "price per ride" notification sent by the app to an authority. Information flows through these channels:
 
1. **Taximeter route (normal taxi):** each taxi has a taximeter. Trip data is sent wirelessly (at least weekly) to a licensed **redovisningscentral**, which hands it to Skatteverket when Skatteverket asks.
2. **Booking-central route (the 2020 "new category"):** cars without a taximeter but with special certified equipment, connected to a licensed **beställningscentral**. Only **pre-booked, fixed-price** trips. Payment must go through the central, not through the driver. The central collects and stores tax-control data and hands it to Skatteverket on request.
3. **Price proof:** when a fixed price is agreed, the driver registers it at the start of the trip, and the permit holder must give Transportstyrelsen a copy of the price proof on request.
4. **Platform reporting (DAC7):** a platform that mediates personal services (including transport) reports sellers and their income to Skatteverket once a year (control statement **KU90**), after registering as a reporting platform operator.
5. **VAT:** passenger transport is taxed at 6% VAT, reported by the seller.
## 3. Two ways to launch
 
**A. Partner model (what Uber and Bolt do): recommended for a first pilot**
- Drivers use their own or a fleet partner's taxi traffic permit, hold a taxi driver licence, and drive registered taxi cars with a taximeter.
- Your company is the booking and payment platform: matching, price agreement, tracking, support.
- You register as a DAC7 platform operator and file KU90.
**B. Booking-central model**
- Your company applies to Transportstyrelsen for a booking-central permit (suitability, finances, good repute, certified technical equipment).
- Cars use the special equipment instead of a taximeter. Only pre-booked fixed-price trips. Payment through your platform.
- This fits the "agree a price in the app" idea structurally, but it is heavier. In 2018 an industry body said the needed solutions did not yet exist, so check whether any licensed central or equipment supplier is available today.
## 4. How the app's features map to the rules
 
| Feature | Status |
|---|---|
| Negotiated, locked fixed price | Fits: fixed prices are allowed and must be registered at trip start |
| Price range (minimum and maximum bid) | Good consumer protection. Check competition law (see section 7) |
| Price proof receipt | **To build:** immutable record of offers, final price, tariff, time, parties |
| Payments | **To build:** in-app payment through a licensed payment provider. Required for route B |
| Licensed drivers only | Driver approval exists. **To build:** document upload and verification of permit, licence, vehicle, insurance |
| Shared rides | **Open legal question** (see section 7) |
 
## 5. Technical integration checklist
 
- [ ] Driver onboarding: taxi driver licence, taxi traffic permit (own or fleet partner), vehicle registration (yellow plates), insurance
- [ ] Immutable price-proof record per trip, exportable on request
- [ ] Push the agreed fixed price to the driver so it is registered in the taximeter at trip start
- [ ] Ledger: fare, 6% VAT, platform commission, payouts, per seller
- [ ] DAC7: collect seller identity data, register with Skatteverket, annual KU90 file
- [ ] Payments: Stripe Connect or a Swedish PSP; Swish later
- [ ] GDPR: privacy policy, location-data retention, data processing agreements, DPIA, data export and deletion
- [ ] Automated decisions: avoid fully automatic driver suspensions without review
## 6. Company checklist
 
- [ ] Swedish AB, F-skatt, VAT registration
- [ ] Insurance (passenger liability)
- [ ] Terms for riders and drivers, complaints process
- [ ] Accountant who knows passenger-transport VAT and platform commissions
- [ ] Lawyer for transport, tax and competition law
## 7. Questions to ask Transportstyrelsen, Skatteverket and a lawyer
 
1. **Shared rides:** how are two separate bookings with separate fixed prices in one trip handled for price information, taximeter registration and tax reporting?
2. **Price guide and minimum bid:** can a platform set guide prices and minimum bids for independent drivers without raising competition-law issues?
3. **Price lists:** a company that only uses fixed prices must publish a price list. How does that apply when every price is negotiated inside a range?
4. **Booking central:** is there a licensed central or certified equipment supplier you can partner with?
5. **Platform work:** how will the EU Platform Work Directive implementation affect driver status?
## 8. Sources
 
- Taxitrafiklagen (2012:211): https://lagen.nu/2012:211
- Transportstyrelsen, new category of taxi traffic: https://www.transportstyrelsen.se/sv/vagtrafik/yrkestrafik/taxi/ny-kategori-av-taxitrafik/
- Transportstyrelsen, redovisningscentraler: https://www.transportstyrelsen.se/sv/vagtrafik/yrkestrafik/taxi/taxiforetag/redovisningscentraler-for-taxi/
- Transportstyrelsen, price information: https://www.transportstyrelsen.se/en/road/Commercial-transport/price-information-for-taxi-journeys-in-sweden/
- TSFS 2023:24 and TSFS 2020:4 (taxi regulations): https://www.transportstyrelsen.se/TSFS/
- Government bill 2017/18:239: https://lagen.nu/prop/2017/18:239
- Skatteverket, taxi, F-tax and VAT: https://www.skatteverket.se/foretag/skatterochavdrag/bilochtrafikiforetaget/taxifskattochmoms.4.7be5268414bea064694d197.html
- Skatteverket, platform operator statements KU90 to KU93: https://www.skatteverket.se/foretag/skatterochavdrag/kontrolluppgifter/kontrolluppgifterfranplattformsoperatorerku90ku91ku92ochku93.4.21e4ba96188260715e3109.html
- Uber driver requirements (Sweden): https://www.uber.com/sv-SE/drive/requirements
- Taxi Stockholm published tariff (market reference): https://www.taxistockholm.se/en/prices
 