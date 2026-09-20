/**
 * add-cities.js — generate new "gift-delivery-<city>.html" pages plus all the
 * data/links that go with them.
 *
 * For each city in CITIES it will (idempotently):
 *   1. Create gift-delivery-<slug>.html from a template city page, swapping in
 *      the city name/state, unique CITY-BLOCK copy and CITY-FAQ items.
 *   2. Append the entry to seo/city-data.json (used by enrich-cities.js).
 *   3. Append pincode range to data/pincodes.json.
 *   4. Append the URL to seo/keywords.json -> sitemapOnly (priority 0.8).
 *   5. Append the URL to sitemap.xml.
 *   6. Add a country-card + OfferCatalog item to gift-delivery-india.html.
 *   7. Rebuild the sitewide footer "Cities" list on every HTML page.
 *
 * Usage:
 *   node seo/add-cities.js          # apply
 *   node seo/add-cities.js --dry    # report what would change, save nothing
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = 'gift-delivery-agra.html';
const DRY = process.argv.includes('--dry');
const TODAY = new Date().toISOString().slice(0, 10);

const CITIES = [
  {
    slug: 'amritsar', name: 'Amritsar', state: 'Punjab', zone: 'north',
    slaText: 'within 48 hours', emoji: '🛕', pincodes: ['143001', '143010'],
    intro: 'The spiritual capital of the Sikh faith revolves around the Golden Temple and its langar, ringed by the bazaars of Hall Bazaar and the colonial-era Ram Bagh gardens. From gratitude gifts to birthday cakes in Ranjit Avenue, our delivery partners cover the walled city and Amritsar\'s fast-growing suburbs.',
    areas: ['Golden Temple area', 'Hall Bazaar', 'Katra Jaimal Singh', 'Lawrence Road', 'Ranjit Avenue', 'Model Town', 'Majitha Road', 'Chheharta', 'Court Road', 'Jahazgarh', 'Sultanwind', 'Batala Road'],
    faqs: [
      { q: 'Can you deliver near the Golden Temple or its langar hall?', a: 'Yes — the walled city around the Golden Temple is served on bike and foot, with delivery timed respectfully around peak darshan hours.' },
      { q: 'Do you deliver during Gurpurab and Diwali nights in Amritsar?', a: 'Yes — festival weeks are our busiest here, so order two days ahead to lock an evening slot in Ranjit Avenue or the old city.' }
    ]
  },
  {
    slug: 'jodhpur', name: 'Jodhpur', state: 'Rajasthan', zone: 'north',
    slaText: 'within 48 hours', emoji: '🏰', pincodes: ['342001', '342012'],
    intro: 'Beneath the ramparts of Mehrangarh, the Blue City\'s indigo lanes give way to the markets of Sardar and Clock Tower and the modern colonies of Ratanada and Shastri Nagar. Whether it\'s a wedding-season hamper or a cake for a Paota birthday, we deliver across Jodhpur\'s old and new quarters.',
    areas: ['Ratanada', 'Sardarpura', 'Shastri Nagar', 'Paota', 'Mandore', 'Basni', 'Bhagat Ki Kothi', 'Chopasni Housing Board', 'Rajeev Gandhi Nagar', 'Mahamandir', 'Banar', 'Pal Road'],
    faqs: [
      { q: 'Can you deliver during Jodhpur\'s wedding season?', a: 'Yes — Jodhpur hosts grand destination weddings; share the venue and event timing and we coordinate a smooth handover with venue staff.' },
      { q: 'Is Basni\'s industrial belt covered for delivery?', a: 'Yes, Basni and the Mandore Road belt follow the same Jodhpur schedule, with factory-hour handovers on request.' }
    ]
  },
  {
    slug: 'udaipur', name: 'Udaipur', state: 'Rajasthan', zone: 'north',
    slaText: 'within 48 hours', emoji: '🛶', pincodes: ['313001', '313012'],
    intro: 'The City of Lakes turns every celebration into a scene — Lake Pichola glittering below the City Palace, courtyards lit for destination weddings, and Hiran Magri\'s quiet residential blocks. Our riders cover Udaipur from the old ghats to the Sukher and Bhuwana outskirts.',
    areas: ['Fateh Sagar', 'Hiran Magri', 'Bhuwana', 'Ambamata', 'Sector 4', 'Sector 14', 'Sukher', 'Bedla Road', 'Saheliyon Ki Bari', 'Bhupalpura', 'Madhuban', 'Rajsamand Road'],
    faqs: [
      { q: 'Can you deliver to wedding venues and lakeside hotels in Udaipur?', a: 'Yes — destination-wedding deliveries are a speciality; share the property name and event slot and we coordinate with the front desk.' },
      { q: 'How fast is delivery to Hiran Magri?', a: 'Hiran Magri and central Udaipur usually complete within 48 hours on our northern express line.' }
    ]
  },
  {
    slug: 'aurangabad', name: 'Aurangabad', state: 'Maharashtra', zone: 'west',
    slaText: 'within 48–72 hours', emoji: '🏛️', pincodes: ['431001', '431012'],
    intro: 'Gateway to the Ajanta and Ellora caves, Aurangabad pairs Mughal-era monuments like Bibi Ka Maqbara with the bustling CIDCO and Garkheda neighbourhoods. We deliver cakes, flowers and hampers across the city and out to the Waluj and Shendra industrial belts.',
    areas: ['CIDCO', 'Garkheda', 'Kranti Chowk', 'Ushiwadi', 'Paithan Road', 'Jalna Road', 'Beed Bypass', 'Waluj', 'Pundalik Nagar', 'Shivaji Nagar', 'Gajanan Township', 'Satara'],
    faqs: [
      { q: 'Do you deliver to the Waluj and Shendra industrial areas?', a: 'Yes — Waluj MIDC and the Shendra belt are covered with working-hour gate handovers; mention the unit name at checkout.' },
      { q: 'Is Aurangabad the same as Chhatrapati Sambhajinagar for delivery?', a: 'Yes — the city\'s new official name makes no difference; we deliver to all of Aurangabad (Chhatrapati Sambhajinagar) on the same schedule.' }
    ]
  },
  {
    slug: 'prayagraj', name: 'Prayagraj', state: 'Uttar Pradesh', zone: 'north',
    slaText: 'within 48–72 hours', emoji: '🕉️', pincodes: ['211001', '211012'],
    intro: 'At the confluence of the Ganga, Yamuna and the mythical Saraswati, Prayagraj is a pilgrim city and a lively university town at once. We deliver across Civil Lines, the colonial-era Chowk, the Bhardwaj Ashram belt and the newer colonies of Naini and Jhunsi.',
    areas: ['Civil Lines', 'Allahpur', 'Katra', 'George Town', 'Dhoomanganj', 'Naini', 'Jhunsi', 'Tagore Town', 'Ashok Nagar', 'Rajapur', 'Colonelganj', 'Teliarganj'],
    faqs: [
      { q: 'Can you deliver during Kumbh or Magh Mela in Prayagraj?', a: 'The mela transforms the Sangam area — we run adjusted routes with pre-booked slots only, so plan a week or two ahead during mela months.' },
      { q: 'Do you deliver to Naini and Jhunsi across the river?', a: 'Yes — both Naini and Jhunsi are standard stops on our Prayagraj route, adding a short bridge-transit buffer.' }
    ]
  },
  {
    slug: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', zone: 'south',
    slaText: 'within 48–72 hours', emoji: '🌴', pincodes: ['575001', '575012'],
    intro: 'Karnataka\'s coastal gem blends Konkani warmth, temple towns and the Arabian Sea. From Hampankatta\'s busy heart and Kadri\'s hills to Surathkal\'s beaches, we deliver celebration cakes, flowers and combos with care for the humid coast.',
    areas: ['Hampankatta', 'Balmatta', 'Kadri', 'Mangaladevi', 'Surathkal', 'Kankanady', 'Derebail', 'Bikarnakatte', 'Panambur', 'Kulshekar', 'Bejai', 'Kavoor'],
    faqs: [
      { q: 'Can you deliver to hostels near NITK Surathkal?', a: 'Yes — campus and hostel handovers around Surathkal and NITK are coordinated with the receiver by phone.' },
      { q: 'Do fresh cakes survive Mangaluru\'s humidity in transit?', a: 'They do — cakes travel in insulated packs with quick last-mile delivery, so they arrive fresh even on warm coastal days.' }
    ]
  },
  {
    slug: 'puducherry', name: 'Puducherry', state: 'Puducherry', zone: 'south',
    slaText: 'within 48–72 hours', emoji: '🏖️', pincodes: ['605001', '605013'],
    intro: 'Puducherry\'s mustard-yellow French Quarter, breezy Promenade and the experimental township of Auroville give this coastal union territory a character all its own. We deliver across White Town\'s heritage lanes and the wider urban belt from Kalapet to Villianur.',
    areas: ['White Town', 'French Quarter', 'Goubert Market', 'Auroville', 'Kalapet', 'Villianur', 'Reddiarpalayam', 'Mudaliarpet', 'Lawspet', 'Thattanchavady', 'Muthialpet', 'Bahour'],
    faqs: [
      { q: 'Can you deliver inside Auroville?', a: 'Yes — Auroville deliveries are handled with call-ahead coordination at the community\'s reception points.' },
      { q: 'Do the heritage French Quarter lanes allow delivery?', a: 'Yes — the narrow heritage streets are served on two-wheelers with a quick call to the receiver before the final drop.' }
    ]
  },
  {
    slug: 'kollam', name: 'Kollam', state: 'Kerala', zone: 'south',
    slaText: 'within 48–72 hours', emoji: '⛵', pincodes: ['691001', '691013'],
    intro: 'Kollam, the cashew capital of the world, opens onto the palm-fringed Ashtamudi Lake and a maze of backwater canals. We deliver Onam hampers, cakes and flowers from the busy Chinnakada round to the lakeside wards of Thangassery and Sakthikulangara.',
    areas: ['Chinnakada', 'Chamakada', 'Kilikolloor', 'Ashramam', 'Mundakkal', 'Thangassery', 'Sakthikulangara', 'Kadappakada', 'Kottarakkara Road', 'Mevaram', 'Pallimukku', 'Kavanad'],
    faqs: [
      { q: 'Can you deliver during Onam in Kollam?', a: 'Yes — Onam is peak season here; pre-orders get priority slots, and we schedule around the festive rush at Chinnakada.' },
      { q: 'Do you cover the backwater and lakeside areas?', a: 'Yes — lakeside wards including Thangassery are covered; some canal-side addresses get a call-ahead for the final approach.' }
    ]
  },
  {
    slug: 'ajmer', name: 'Ajmer', state: 'Rajasthan', zone: 'north',
    slaText: 'within 48 hours', emoji: '🕌', pincodes: ['305001', '305004'],
    intro: 'A pilgrim city that circles the dargah of Khwaja Moinuddin Chishti, Ajmer pairs centuries-old shrine lanes with the lakeside calm of Anasagar and leafy new colonies like Vaishali Nagar. From flower trays near the dargah to birthday cakes on the Beawar Road stretch, our delivery partners cover Ajmer\'s old and new quarters.',
    areas: ['Dargah Bazaar', 'Naya Bazaar', 'Madar Gate', 'Anasagar', 'Vaishali Nagar', 'Panchsheel', 'Shastri Nagar', 'Chand Vardai Marg', 'Kaiser Ganj', 'Civil Lines', 'Beawar Road', 'Kekri Road'],
    faqs: [
      { q: 'Can you deliver gifts for pilgrims near the dargah and guest houses?', a: 'Yes — we coordinate dargah-area deliveries with call-ahead timing so your flowers or hamper arrive at the guest house exactly when your loved one is there.' },
      { q: 'Do you cover Vaishali Nagar and the new colonies of Ajmer?', a: 'Yes — Vaishali Nagar, Panchsheel and the newer residential belts follow the same 48 hour express schedule as central Ajmer.' }
    ]
  },
  {
    slug: 'bhilai', name: 'Bhilai', state: 'Chhattisgarh', zone: 'central',
    slaText: 'within 48–72 hours', emoji: '🏭', pincodes: ['490006', '490023'],
    intro: 'The steel city of Chhattisgarh, Bhilai grew around the Bhilai Steel Plant and its company townships, mingling darbar halls, bazaars and modern malls. We deliver celebration cakes, flowers and rakhi gifts across Bhilai and Durg, from Civic Centre to the Smriti Nagar colonies.',
    areas: ['Civic Centre', 'Supela', 'Smriti Nagar', 'Kohka', 'Patel Nagar', 'Power House', 'Juna Bhilai', 'Agar Para', 'Vaishali Nagar', 'Camp 2', 'Durg', 'Borsi'],
    faqs: [
      { q: 'Can you deliver into the Bhilai Steel Plant township areas?', a: 'Yes — the company townships such as Smriti Nagar and the Camp areas are covered with gate or call-ahead handovers on the main roads.' },
      { q: 'Do you serve both Bhilai and Durg?', a: 'Yes — Bhilai and Durg are treated as one delivery area, so a gift can cross the distance between them on the same schedule.' }
    ]
  },
  {
    slug: 'bikaner', name: 'Bikaner', state: 'Rajasthan', zone: 'north',
    slaText: 'within 48 hours', emoji: '🐫', pincodes: ['334001', '334004'],
    intro: 'A desert city of ochre forts and palaces, Bikaner hums around the kachori lanes of Kote Gate and the sandstone courtyards of Junagarh Fort. From camel-fair family gatherings to birthdays on the hospital road strip, we deliver gifts across the walled city and its newer colonies.',
    areas: ['Kote Gate', 'Junagarh Fort area', 'Bada Bazaar', 'Rani Bazaar', 'Ganga Shahar', 'Pushkarna Bazaar', 'Shivbari', 'Lalgarh', 'Hospital Road', 'Jaipur Road', 'Nathusar Gate', 'Karni Nagar'],
    faqs: [
      { q: 'Can you deliver during the Bikaner Camel Fair?', a: 'Yes — order ahead during the fair and we slot deliveries around the parade grounds and the busy Ganga Shahar stretch.' },
      { q: 'Do you cover the newer colonies like Karni Nagar and Hospital Road?', a: 'Yes — Karni Nagar, Hospital Road and the other new sectors follow the regular Bikaner route within 48 hours.' }
    ]
  },
  {
    slug: 'gorakhpur', name: 'Gorakhpur', state: 'Uttar Pradesh', zone: 'north',
    slaText: 'within 48–72 hours', emoji: '🛕', pincodes: ['273001', '273013'],
    intro: 'A temple town and crossroads of eastern Uttar Pradesh, Gorakhpur pairs the famous Gorakhnath Temple with a busy railway-city energy. From the mohalla lanes of Golghar to the wide avenues of Aswa Marg, we deliver flowers, cakes and rakhi combos across the city.',
    areas: ['Golghar', 'Aswa Marg', 'Basharatpur', 'Mohaddipur', 'Civil Lines', 'Rustampur', 'Chargawan', 'Betiahata', 'Shahminar Road', 'Medical College area', 'Gorakhnath Temple area', 'Kushmi Bazaar'],
    faqs: [
      { q: 'Can you deliver near Gorakhnath Temple and its fairs?', a: 'Yes — temple-area and mela deliveries are arranged with call-ahead timings around crowd and darshan hours.' },
      { q: 'Do you cover the far colonies of Gorakhpur?', a: 'Yes — Basharatpur, Mohaddipur and the Rustampur belt are all on the express Gorakhpur route within 48–72 hours.' }
    ]
  },
  {
    slug: 'jalandhar', name: 'Jalandhar', state: 'Punjab', zone: 'north',
    slaText: 'within 48 hours', emoji: '🚂', pincodes: ['144001', '144004'],
    intro: 'A thriving Punjab city between the Sutlej and Beas, Jalandhar is known for its sports-goods industry, lively bazaars and the golden Gurudwara Chhevin Patshahi. Our riders cover everything from Model Town\'s shopping lanes to the leafy cantonment and the PAP lines beyond.',
    areas: ['Model Town', 'Adarsh Nagar', 'Gurdev Nagar', 'Lajpat Nagar', 'Basti Nau', 'Jalandhar Cantonment', 'Civil Lines', 'Raman Road', 'Ram Nagar', 'Sports Colony', 'Mithapur Road', 'PAP Lines'],
    faqs: [
      { q: 'Can you deliver to hostels and colleges near Guru Nanak Dev University?', a: 'Yes — hostel and campus handovers near GNDU are coordinated by phone with the receiver.' },
      { q: 'Do you deliver during Gurpurab and Baisakhi in Jalandhar?', a: 'Yes — order two days ahead during Gurpurab and Baisakhi to secure an evening slot in Model Town or the old city.' }
    ]
  },
  {
    slug: 'jhansi', name: 'Jhansi', state: 'Uttar Pradesh', zone: 'central',
    slaText: 'within 48–72 hours', emoji: '🏹', pincodes: ['284001', '284003'],
    intro: 'The city of Rani Lakshmibai, Jhansi sits at the crossroads of Bundelkhand, guarding the fort that watched over the 1857 uprising. We deliver gift hampers, flowers and cakes from the historic Sadar Bazaar to the cantonment and the growing suburbs along Nagra Road.',
    areas: ['Sadar Bazaar', 'Civil Lines', 'Cantonment', 'Prem Nagar', 'Dharagaon Bazaar', 'Nagra Road', 'Bhojla', 'Gwalior Road', 'Jeevan Shah Lane', 'Elite Crossing', 'Sipri Bazaar', 'Maniya'],
    faqs: [
      { q: 'Can you deliver around Jhansi Fort and the heritage lanes?', a: 'Yes — the lanes below the fort and Chhatrasal Park are served on two-wheelers with a call before the final drop.' },
      { q: 'Do you cover the cantonment and Nagra Road suburbs?', a: 'Yes — the cantonment and Nagra Road extensions follow the regular Jhansi route within 48–72 hours.' }
    ]
  },
  {
    slug: 'kota', name: 'Kota', state: 'Rajasthan', zone: 'central',
    slaText: 'within 48–72 hours', emoji: '🏞️', pincodes: ['324001', '324007'],
    intro: 'The coaching capital of India on the banks of the Chambal, Kota is also famed for its palaces and the grand Chambal Gardens. From students in bustling hostel lanes near Landmark City to family anniversaries in Talwandi, we deliver across Kota\'s fast-growing map.',
    areas: ['Talwandi', 'Central Spine', 'Rangbari', 'Nayapura', 'Mahaveer Nagar', 'Chambal Gardens', 'Kunhari', 'Aerodrome Road', 'Kota University area', 'Gumanpura', 'Jawahar Nagar', 'DCM Colony'],
    faqs: [
      { q: 'Can you deliver to student hostels and coaching centres in Kota?', a: 'Yes — hostels and coaching campuses across Mahaveer Nagar and the Central Spine are covered with receiver call-ahead.' },
      { q: 'Do you deliver to the new colonies around Kunhari?', a: 'Yes — Kunhari, Rangbari and Talwandi all sit on our regular Kota route within 48–72 hours.' }
    ]
  },
  {
    slug: 'panipat', name: 'Panipat', state: 'Haryana', zone: 'north',
    slaText: 'within 48 hours', emoji: '🌾', pincodes: ['132103', '132113'],
    intro: 'A textile and grain city in Haryana\'s heartland, Panipat is where historic battlefields meet a bustling economy of looms and refineries. We deliver celebration gifts across the city — from the busy G.T. Road markets to the residential belts of Model Town and Swarn Jayanti Nagar.',
    areas: ['Model Town', 'Swarn Jayanti Nagar', 'Chanderpura', 'Sanoli Road', 'G.T. Road market', 'Bishan Swaroop Colony', 'New Anaj Mandi', 'Madina Colony', 'Sector 12', 'Sector 13-17', 'Jhansa Road', 'Kavi Nagar'],
    faqs: [
      { q: 'Can you deliver to hostels and coaching centres in Panipat?', a: 'Yes — the growing coaching and hostel belt near Jhansa Road and Swarn Jayanti is covered with receiver call-ahead.' },
      { q: 'Do you cover both old Panipat and the new sectors?', a: 'Yes — old-market addresses and the new Sectors 12–17 follow one schedule within 48 hours.' }
    ]
  },
  {
    slug: 'solapur', name: 'Solapur', state: 'Maharashtra', zone: 'central',
    slaText: 'within 48–72 hours', emoji: '🧵', pincodes: ['413001', '413007'],
    intro: 'A proud textile city at the meeting point of Maharashtra and Karnataka, Solapur is known for its handloom chadars and the Siddheshwar Temple on the Brama riverbank. Our network covers the old city, the MIDC belt and the new colonies rising along the Akkalkot Road.',
    areas: ['Vijapur Road', 'Sadar Bazaar', 'Civil Hospital area', 'Siddheshwar Peth', 'Raviwar Peth', 'Akkalkot Road', 'Khot Nagar', 'MIDC Hotgi', 'Vishnu Nagar', 'Jule Solapur', 'Takwe', 'Bhapuji Chowk'],
    faqs: [
      { q: 'Can you deliver to the MIDC Hotgi industrial area?', a: 'Yes — MIDC Hotgi and the surrounding industrial belt get working-hour gate handovers; mention the unit name at checkout.' },
      { q: 'Do you cover Solapur\'s newer colonies?', a: 'Yes — Vishnu Nagar, Takwe and the Akkalkot Road extensions follow the standard 48–72 hour schedule.' }
    ]
  },
  {
    slug: 'vellore', name: 'Vellore', state: 'Tamil Nadu', zone: 'south',
    slaText: 'within 48–72 hours', emoji: '🏰', pincodes: ['632001', '632014'],
    intro: 'A charming Tamil Nadu city anchored by the 16th-century Vellore Fort and ringed by temple towns and colleges, Vellore also draws visitors to its world-famous hospitals. We deliver flowers, cakes and anniversary gifts across the fort area, Sathuvachari and the hospital belt around Christian Medical College.',
    areas: ['Vellore Fort area', 'Sathuvachari', 'CMC Hospital area', 'Katpadi', 'Gandhi Nagar', 'Virudhachalam Road area', 'Arcot Road', 'Kattupalli', 'Kilikodungam', 'Thiruparkadal', 'MGR Nagar', 'Bharathi Nagar'],
    faqs: [
      { q: 'Can you deliver to patients and visitors near CMC Hospital?', a: 'Yes — deliveries in the CMC belt are coordinated by phone at reception or the ward entrance where permitted.' },
      { q: 'Do you cover Katpadi and the college areas of Vellore?', a: 'Yes — Katpadi, Sathuvachari and the college zones are on our regular route within 48–72 hours.' }
    ]
  },
  {
    slug: 'vadodara', name: 'Vadodara', state: 'Gujarat', zone: 'west',
    slaText: 'within 48 hours', emoji: '🎭', pincodes: ['390001', '390023'],
    intro: 'The city of the Gaekwads, Vadodara brings together the grandeur of Laxmi Vilas Palace, the peace of Sayaji Baug and some of the country\u2019s liveliest Navratri nights. Whether it\u2019s a custom cake for a birthday in Alkapuri or a festive hamper for a family in Fatehgunj, our delivery partners cover the city from the old market belts to the expanding New VIP Road side.',
    areas: ['Alkapuri', 'Sayajigunj', 'Fatehgunj', 'Gotri', 'Karelibaug', 'Akota', 'Manjalpur', 'New VIP Road', 'Waghodia Road', 'Sama', 'Makarpura', 'Sardar Estate'],
    faqs: [
      { q: 'Can you deliver to garba venues and Navratri celebrations in Vadodara?', a: 'Yes — Navratri is Vadodara\u2019s biggest week; order ahead and we coordinate delivery to garba venues and residential surprise slots with call-ahead timing.' },
      { q: 'Is the Makarpura industrial side covered for delivery?', a: 'Yes — Makarpura and the Waghodia Road belt follow the same schedule with working-hour gate handovers; mention the unit name at checkout.' }
    ]
  },
  {
    slug: 'thane', name: 'Thane', state: 'Maharashtra', zone: 'west',
    slaText: 'within 48 hours', emoji: '🏙️', pincodes: ['400601', '400615'],
    intro: 'Thane\u2019s lake city charm — Upvan Lake, the Talao ghats and the historic Kopineshwar temple — sits beside some of Mumbai\u2019s busiest commuter corridors. We deliver cakes, flowers and gift combos across Ghodbunder Road\u2019s new towers, the classic Naupada–Thane West localities and the Kasarvadavali phases beyond Manpada.',
    areas: ['Ghodbunder Road', 'Naupada', 'Thane West', 'Kasarvadavali', 'Manpada', 'Majiwada', 'Vasant Vihar', 'Kopri', 'Thane East', 'Wagle Estate', 'Balkum', 'Charai'],
    faqs: [
      { q: 'Can you deliver to offices in Wagle Estate and the IT belt?', a: 'Yes — reception handovers across Wagle Estate and the Kasarvadavali office parks are routine during working hours.' },
      { q: 'Do you manage society gate protocols in Thane?', a: 'Yes — share your society and tower name and our riders complete visitor registration before the final approach.' }
    ]
  },
  {
    slug: 'guntur', name: 'Guntur', state: 'Andhra Pradesh', zone: 'south',
    slaText: 'within 48 hours', emoji: '🌶️', pincodes: ['522001', '522034'],
    intro: 'Guntur, the chilli-and-tobacco heart of Andhra, is equally loved for its fiery cuisine and the temple towns that ring the Krishna. Celebrations here mean pulihora trays as much as cakes, and we deliver both styles of joy from Arundelpet\u2019s trade lanes to the residential belts of Nallapadu and Gorantla.',
    areas: ['Arundelpet', 'Brodipet', 'Kothapet', 'Nallapadu', 'Gorantla', 'Old Guntur City', 'Chandramouli Nagar', 'Pattabhipuram', 'Vijay Nagar', 'Brindavan Gardens', 'Sangadigunta', 'Auto Nagar'],
    faqs: [
      { q: 'Do you deliver to college hostels near the university belt?', a: 'Yes — hostels and campuses across the Nallapadu and university-side areas receive coordinated gate handovers by phone.' },
      { q: 'How is delivery during Sankranti in Guntur?', a: 'Sankranti is peak season here; order two days ahead and we slot deliveries around the kite-flying mornings and family functions.' }
    ]
  },
  {
    slug: 'rajahmundry', name: 'Rajahmundry', state: 'Andhra Pradesh', zone: 'south',
    slaText: 'within 48 hours', emoji: '🚣', pincodes: ['533101', '533125'],
    intro: 'Bisected by the mighty Godavari, Rajahmundry blends heritage ghats and riverside temples with a strong educational and cotton-industry energy. From grand family functions to birthday cakes beside the river, we deliver across the Fort–GSM side, Syamala Nagar and the islands across the bridge.',
    areas: ['Fort Gate', 'Gandhi Nagar', 'Syamala Nagar', 'Suryaraopeta', 'Patamatalanka', 'Danavaipeta', 'Katheru', 'Kadiyam', 'Korukonda Road', 'Aryapuram', 'Devagiri Nagar', 'Rallabandi'],
    faqs: [
      { q: 'Can you deliver to the islands and the far bank across the Godavari?', a: 'Yes — island and across-bridge deliveries ride the same Rajahmundry route with a short bridge-transit buffer; confirm the address on WhatsApp.' },
      { q: 'Do you cover the college belt on Korukonda Road?', a: 'Yes — hostels and campuses on Korukonda Road and the Katheru side receive standard coordinated handovers.' }
    ]
  },
  {
    slug: 'nellore', name: 'Nellore', state: 'Andhra Pradesh', zone: 'south',
    slaText: 'within 48 hours', emoji: '🦐', pincodes: ['524001', '524004'],
    intro: 'A temple town of southern Andhra Pradesh, Nellore is gently fed by the Pennar and famous for its freshwater prawns and the tall gopuram of Ranganatha Swamy. From busy A.K. Nagar and the railway-side bustle to the growing Magunta Layout and Sriharikota Road stretches, we deliver cakes, flowers and festive hampers across the city.',
    areas: ['A.K. Nagar', 'Magunta Layout', 'Sriharikota Road', 'Venkatachalam Road', 'Santhapet', 'B.C. Kothur', 'Vedayapalem', 'Muthukur Road', 'Baby Bazar', 'Nethaji Nagar', 'Gandhi Nagar', 'Nellore City'],
    faqs: [
      { q: 'Can you deliver near the Sri Ranganathaswamy temple?', a: 'Yes — temple-area and ghat-side deliveries are arranged with call-ahead timing around darshan and event hours.' },
      { q: 'Is the railway-side and Vedayapalem area covered?', a: 'Yes — Vedayapalem and the railway belt follow the standard Nellore route within our express window.' }
    ]
  },
  {
    slug: 'tirunelveli', name: 'Tirunelveli', state: 'Tamil Nadu', zone: 'south',
    slaText: 'within 48 hours', emoji: '🍬', pincodes: ['627001', '627012'],
    intro: 'On the banks of the Tamirabarani, Tirunelveli is best known for the towering Nellaiappar temple and the halwa that fills its shops and festivals. We deliver sweet hampers, flowers and celebration cakes from the junction and Junction Road bustle to the residential belts of Melapalayam, Pettai and Palayamkottai.',
    areas: ['Junction Road', 'Nellaiappar Temple area', 'Melapalayam', 'Pettai', 'Palayamkottai', 'Thatchanallur', 'Kokirakulam', 'Vannarpettai', 'Punnainallur', 'Thiruvananthapuram Road', 'Tirunelveli Town', 'Sankaranpillai'],
    faqs: [
      { q: 'Can I send local Tirunelveli halwa along with my gift?', a: 'Many customers do — buy halwa from the old-town shops and we collect-and-deliver it alongside your Giftora hamper; arrange via WhatsApp.' },
      { q: 'Do you cover college hostels on the Palayamkottai side?', a: 'Yes — hostel and campus handovers across Palayamkottai are coordinated with the receiver by phone.' }
    ]
  },
  {
    slug: 'tiruppur', name: 'Tiruppur', state: 'Tamil Nadu', zone: 'south',
    slaText: 'within 48 hours', emoji: '👕', pincodes: ['641601', '641613'],
    intro: 'The knitwear capital of India, Tiruppur stitches garments for the world and runs on round-the-clock mill schedules and export deadlines. Festive and family gifting here is equally fast — we deliver birthday cakes, flowers and Pongal-ready hampers across the Avinashi Road corridor, the mill-worker colonies and the expanding Palladam and Annur sides.',
    areas: ['Avinashi Road', 'Kumaran Nagar', 'Veerapandi', 'Annur Road', 'Palladam Road', 'Mangalam Road', 'Nanjarayanpet', 'S.S. Layout', 'Ramanathapuram', 'Mudalipalayam', 'Orchards', 'Sozhamangalam'],
    faqs: [
      { q: 'Can you handle factory-gate and mill-timing deliveries?', a: 'Yes — mention the unit name and shift timing at checkout, and we deliver with working-hour gate handovers across the knitting belt.' },
      { q: 'Is delivery available during Pongal week in Tiruppur?', a: 'Yes — Pongal is peak season here; order two days ahead to lock an evening slot across the city.' }
    ]
  },
  {
    slug: 'erode', name: 'Erode', state: 'Tamil Nadu', zone: 'south',
    slaText: 'within 48 hours', emoji: '🌾', pincodes: ['638001', '638012'],
    intro: 'Erode, the turmeric capital that also weaves fine handloom, sits where the Bhavani joins the Kaveri — a junction of rivers, forests and a famously disciplined market town. We deliver puja-friendly hampers, plants and celebration cakes from the old Brough Road belt to the residential stretches of Veerappanchatram and Perundurai Road.',
    areas: ['Brough Road', 'Veerappanchatram', 'Perundurai Road', 'Villarasampatti', 'Erode Fort area', 'Sathy Road', 'Kolinjimavu', 'Chittode Road', 'Chennimalai Road', 'Muthaliyar Chattram', 'E.V.N. Road', 'Lakshminagar'],
    faqs: [
      { q: 'Can you deliver near the Bhavani and Perundurai side?', a: 'Yes — the Bhavani junction and Perundurai Road belts are standard stops on our Erode route.' },
      { q: 'Do you offer bulk turmeric-industry gifting here?', a: 'Yes — festival hampers for staff and partners are common; message quantities on WhatsApp for a coordinated quote.' }
    ]
  },
  {
    slug: 'thanjavur', name: 'Thanjavur', state: 'Tamil Nadu', zone: 'south',
    slaText: 'within 48 hours', emoji: '🏛️', pincodes: ['613001', '613007'],
    intro: 'Thanjavur, crowned by the 11th-century Brihadeeswara temple, is Tamil Nadu\u2019s cultural capital of bronze, silk and Carnatic music — and it celebrates accordingly. From the temple town lanes to the quieter residential blocks of Nanjikottai and Medical College Road, we deliver sweets, flowers and pooja hampers with the right festive touch.',
    areas: ['Temple complex area', 'Old Town', 'Medical College Road', 'Nanjikottai', 'Rajappa Nagar', 'Vallam', 'S.R.M. Nagar', 'Mariappa Nagar', 'Orathanadu Road', 'Kumbakonam Road', 'Vijaya Nagaram', 'Ponni Nagar'],
    faqs: [
      { q: 'Can you deliver near the Brihadeeswara temple?', a: 'Yes — temple-area streets are served on two-wheelers with a call before the final drop, timed around festival processions.' },
      { q: 'Are festive and Margazhi-season deliveries available?', a: 'Yes — pre-orders get priority slots during temple festivals; book a few days ahead for smooth scheduling.' }
    ]
  },
  {
    slug: 'belagavi', name: 'Belagavi', state: 'Karnataka', zone: 'south',
    slaText: 'within 48 hours', emoji: '🏯', pincodes: ['590001', '590010'],
    intro: 'Belagavi, with its Indo-Saracenic fort, cantonment streets and twin Marathi–Kannada culture, is Karnataka\u2019s bustling northern gateway near the Goa and Maharashtra borders. We deliver celebration cakes, flowers and hampers from the Camp side and Fort Area to the residential quarters of Hindwadi, Shahapur and Tilakwadi.',
    areas: ['Camp', 'Fort Area', 'Hindwadi', 'Shahapur', 'Tilakwadi', 'Kakati', 'Udayambagh', 'Khade Bazar', 'Wanless Road', 'Ganjekhol', 'Angol', 'Kolhapur Road'],
    faqs: [
      { q: 'Can you deliver to hotels and hostels in the Camp area?', a: 'Yes — Camp-side hotels, hostels and boarding houses receive coordinated reception handovers.' },
      { q: 'Is Hindwadi and the new colonies covered?', a: 'Yes — Hindwadi, Tilakwadi and the newer layouts follow the same Belagavi schedule.' }
    ]
  },
  {
    slug: 'jamnagar', name: 'Jamnagar', state: 'Gujarat', zone: 'west',
    slaText: 'within 48 hours', emoji: '🛢️', pincodes: ['361001', '361008'],
    intro: 'A city of the Jadeja rulers, Jamnagar pairs majestic palaces and the Lakhota lake-fort with refineries and the salt pans near the Gulf of Kutch. Festive and bandhani-loving Jamnagar celebrates big — we deliver hampers, flowers and cakes from the Palace Road side to the residential sectors of Sector 4, Sector 6 and Gurudwara Road.',
    areas: ['Palace Road', 'Bandar Road', 'Gurudwara Road', 'Sector 4', 'Sector 6', 'Lakhota', 'Krishna Nagar', 'Jalaram Nagar', 'Sanghvi Nagar', 'Gokul Nagar', 'Jambu Drive', 'Darbargadh'],
    faqs: [
      { q: 'Can you deliver to the refinery and industrial belt?', a: 'Yes — refinery-side and industrial-gate handovers follow working hours; mention the unit name at checkout.' },
      { q: 'Are Navratri and Janmashtami deliveries popular here?', a: 'Yes — festivals like Navratri and Janmashtami are peak gifting weeks in Jamnagar; order a few days ahead.' }
    ]
  },
  {
    slug: 'durgapur', name: 'Durgapur', state: 'West Bengal', zone: 'east',
    slaText: 'within 48 hours', emoji: '⚙️', pincodes: ['713201', '713216'],
    intro: 'Durgapur, the steel city of Bengal, grew around the Durgapur Steel Plant and today stretches along NH-2 with IT parks, the City Centre mall and long residential spines. We deliver cakes, flowers and festive combos across the steel township, the Benachity–Bidhannagar blocks and the newer Mohanpur and Fuljhore corners.',
    areas: ['City Centre', 'Benachity', 'Bidhannagar', 'Steel Township', 'Mehedibagan', 'Fuljhore', 'Mamra Bazar', 'Sector 1', 'Sector 2C', 'Mohanpur', 'BP Township', 'Amtala'],
    faqs: [
      { q: 'Can you deliver inside the steel township sectors?', a: 'Yes — the company township sectors are covered with gate and call-ahead handovers on the outer roads.' },
      { q: 'Do you plan around Durga Puja week in Durgapur?', a: 'Yes — Puja pandals bring road chokepoints; order three-plus days ahead for reliable slots that week.' }
    ]
  },
  {
    slug: 'asansol', name: 'Asansol', state: 'West Bengal', zone: 'east',
    slaText: 'within 48 hours', emoji: '🛤️', pincodes: ['713301', '713305'],
    intro: 'A coal-and-steel city of West Bengal and one of eastern India\u2019s busiest rail junctions, Asansol runs on collieries, mills and the grand old G.T. Road. We deliver celebration cakes, flowers and rakhi combos across the G.T. Road stretch, the railway colony and the Burnpur and Neamatpur corridors.',
    areas: ['G.T. Road', 'Railway Colony', 'College More', 'Burnpur', 'Jamuria Road', 'Neamatpur', 'S.B. Gorai Road', 'City Centre', 'Bhanowara', 'Kulti Road', 'Carbide Road', 'Station Bazar'],
    faqs: [
      { q: 'Can you deliver to the railway areas and Burnpur?', a: 'Yes — the railway colony and Burnpur follow the same Asansol route, with gate coordination at the security posts.' },
      { q: 'Is the Ushagram and college belt covered?', a: 'Yes — College More and the Ushagram side are standard stops on our Asansol run.' }
    ]
  },
  {
    slug: 'rourkela', name: 'Rourkela', state: 'Odisha', zone: 'east',
    slaText: 'within 48 hours', emoji: '🏟️', pincodes: ['769001', '769015'],
    intro: 'Ringed by the Brahmani river and dense forests, Rourkela grew around its steel plant and the German-founded township of the 1950s, later adding NIT Rourkela and a lively city centre. We deliver cakes, flowers and festive combos across the numbered steel-city sectors, the Udit Nagar belts and the Bisra and Chhend sprawl.',
    areas: ['Sector 1', 'Sector 2', 'Sector 6', 'Bisra', 'Chhend', 'Udit Nagar', 'Panposh', 'Brahmani Nagar', 'Koel Nagar', 'Jagda', 'Sundargarh Road', 'Ayodhya Nagar'],
    faqs: [
      { q: 'Can you deliver to NIT Rourkela hostels?', a: 'Yes — campus and hostel handovers at NIT and other institutes are coordinated with the receiver by phone.' },
      { q: 'Are deliveries available during Nuakhai?', a: 'Yes — Nuakhai is Rourkela\u2019s biggest festival; order ahead and we schedule around the festive afternoons.' }
    ]
  },
  {
    slug: 'berhampur', name: 'Berhampur', state: 'Odisha', zone: 'east',
    slaText: 'within 48 hours', emoji: '🏖️', pincodes: ['760001', '760010'],
    intro: 'Berhampur, the silk city of Odisha, is famous for its handloom patta and sits a short drive from the beach town of Gopalpur. We deliver festive hampers, flowers and cakes across the busy Giri Road and Bharathi Nagar belts, the residential sprawl toward Aska Road and the scenic Gopalpur side.',
    areas: ['Giri Road', 'Bharathi Nagar', 'Badabazar', 'Srikrishna Puram', 'Budharaja', 'Shanti Nagar', 'Aska Road', 'Bhabani Nagar', 'Ambapua', 'College Road', 'Gopalpur Road', 'New Bus Stand'],
    faqs: [
      { q: 'Can you deliver to Gopalpur beachside?', a: 'Yes — resort and guesthouse deliveries along the Gopalpur Road are arranged with reception coordination.' },
      { q: 'Do you offer silk-and-festival gifting here?', a: 'Yes — Berhampur\u2019s handloom pattas are a beloved pairing; combine your own silk purchase with a Giftora hamper via WhatsApp.' }
    ]
  }
];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function log(msg) { console.log((DRY ? '[dry] ' : '') + msg); }
const eolOf = (s) => (s.includes('\r\n') ? '\r\n' : '\n');
const toEol = (s, eol) => s.split('\n').join(eol);

// ---------------------------------------------------------------------------
// 1. City pages
// ---------------------------------------------------------------------------

function buildCityBlock(city, picksHtml) {
  const sla = String(city.slaText).replace(/^within\s+/i, '');
  const slaLine = city.zone === 'ncr'
    ? `Same-day hand delivery is available across ${esc(city.name)} — orders placed today reach your loved one today, with a personalised note included.`
    : `${esc(city.name)} falls under our express delivery network — most orders reach ${esc(city.name)} within ${sla} of checkout, carefully packed and tracked end to end.`;
  const areas = city.areas.map((a) => `<span>${esc(a)}</span>`).join('');

  return `<!-- CITY-BLOCK-START -->
	<section class="features" id="about-city">
		<div class="container">
			<div class="section-header">
				<span class="section-tag">Local guide</span>
				<h2>Sending gifts to ${esc(city.name)}, <span class="text-gradient">${esc(city.state)}</span></h2>
			</div>
			<div class="city-copy">
				<p>${esc(city.intro)}</p>
				<p>${slaLine}</p>
			</div>
			<div class="city-areas">
				<h3>Areas we cover in ${esc(city.name)}</h3>
				<div class="area-chips">${areas}</div>
			</div>
			${picksHtml}
		</div>
	</section>
	<!-- CITY-BLOCK-END -->`;
}

function buildCityFaq(city) {
  const items = city.faqs.map((f) => `				<details class="faq-item">
					<summary>${esc(f.q)}</summary>
					<p>${esc(f.a)}</p>
				</details>`).join('\n');
  return `<!-- CITY-FAQ-START -->
${items}
				<!-- CITY-FAQ-END -->`;
}

function buildCityPage(template, city) {
  const picksMatch = template.match(/<h3>Popular picks for[\s\S]*?<\/ul>/);
  if (!picksMatch) throw new Error('template: popular picks block not found');
  const picksHtml = picksMatch[0];

  const eol = eolOf(template);
  let html = template;
  html = html.replace(/<!-- CITY-BLOCK-START -->[\s\S]*?<!-- CITY-BLOCK-END -->/, toEol(buildCityBlock(city, picksHtml), eol));
  html = html.replace(/<!-- CITY-FAQ-START -->[\s\S]*?<!-- CITY-FAQ-END -->/, toEol(buildCityFaq(city), eol));
  html = html.split('🏰').join(city.emoji);
  html = html.split('Agra').join(city.name);
  html = html.split('agra').join(city.slug);
  html = html.split('Uttar Pradesh').join(city.state);
  return html;
}

// ---------------------------------------------------------------------------
// 2-5. Data files
// ---------------------------------------------------------------------------

function appendCityData(city) {
  const file = path.join(__dirname, 'city-data.json');
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(`"slug":"${city.slug}"`) || src.includes(`"slug": "${city.slug}"`)) return 'already present';
  const entry = JSON.stringify({
    slug: city.slug, name: city.name, state: city.state, zone: city.zone,
    slaText: city.slaText, emoji: city.emoji, intro: city.intro,
    areas: city.areas, faqs: city.faqs
  });
  const eol = eolOf(src);
  const idx = src.lastIndexOf(']');
  src = src.slice(0, idx).replace(/[\s,]*$/, '') + ',' + eol + eol + '  ' + entry + eol + src.slice(idx);
  if (!DRY) fs.writeFileSync(file, src, 'utf8');
  return 'appended';
}

function appendPincode(city) {
  const file = path.join(ROOT, 'data', 'pincodes.json');
  let src = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(src);
  if (data.some((p) => p.slug === city.slug)) return 'already present';
  const entry = {
    city: city.name, slug: city.slug, start: city.pincodes[0],
    end: city.pincodes[1], slaText: city.slaText
  };
  const eol = eolOf(src);
  const idx = src.lastIndexOf(']');
  const block = JSON.stringify(entry, null, 2).split('\n').join(eol).split(eol).map((l) => '  ' + l).join(eol);
  src = src.slice(0, idx).replace(/[\s,]*$/, '') + ',' + eol + block + eol + src.slice(idx);
  if (!DRY) fs.writeFileSync(file, src, 'utf8');
  return 'appended';
}

function appendKeyword(city) {
  const file = path.join(__dirname, 'keywords.json');
  let src = fs.readFileSync(file, 'utf8');
  const key = `"gift-delivery-${city.slug}.html"`;
  if (src.includes(key)) return 'already present';
  const marker = '"sitemapOnly": {';
  const at = src.indexOf(marker);
  if (at === -1) throw new Error('sitemapOnly not found in keywords.json');
  const pos = at + marker.length;
  const eol = eolOf(src);
  const entry = toEol(`\n    ${key}: {\n      "priority": "0.8",\n      "changefreq": "weekly"\n    },`, eol);
  src = src.slice(0, pos) + entry + src.slice(pos);
  if (!DRY) fs.writeFileSync(file, src, 'utf8');
  return 'appended';
}

function appendSitemap(city) {
  const file = path.join(ROOT, 'sitemap.xml');
  let src = fs.readFileSync(file, 'utf8');
  const loc = `https://gift-ora.online/gift-delivery-${city.slug}.html`;
  if (src.includes(loc)) return 'already present';
  const idx = src.lastIndexOf('</urlset>');
  const block = [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${TODAY}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>0.8</priority>',
    '  </url>', ''
  ].join(eolOf(src));
  src = src.slice(0, idx) + block + src.slice(idx);
  if (!DRY) fs.writeFileSync(file, src, 'utf8');
  return 'appended';
}

// ---------------------------------------------------------------------------
// 6. gift-delivery-india.html (visible grid + OfferCatalog schema)
// ---------------------------------------------------------------------------

function updateIndiaPage(city) {
  const file = path.join(ROOT, 'gift-delivery-india.html');
  let src = fs.readFileSync(file, 'utf8');
  const href = `gift-delivery-${city.slug}.html`;
  if (src.includes(`href="${href}"`)) return 'already present';

  const eol = eolOf(src);

  const offerAnchor = '      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Gift delivery in Shillong", "url": "https://gift-ora.online/gift-delivery-shillong.html" } }';
  if (!src.includes(offerAnchor)) throw new Error('india page: offer anchor not found');
  const offer = toEol(`\n      { "@type": "Offer", "itemOffered": { "@type": "Service", "name": "Gift delivery in ${city.name}", "url": "https://gift-ora.online/${href}" } }`, eol);
  src = src.replace(offerAnchor, offerAnchor + ',' + offer);

  const cardAnchor = toEol(`			<a href="gift-delivery-shillong.html" class="country-card">
				<span class="intl-flag">☁️</span>
				<h3>Shillong</h3>
				<p>Gift delivery in Shillong, Meghalaya</p>
			</a>`, eol);
  if (!src.includes(cardAnchor)) throw new Error('india page: card anchor not found');
  const card = toEol(`\n			<a href="${href}" class="country-card">
				<span class="intl-flag">${city.emoji}</span>
				<h3>${esc(city.name)}</h3>
				<p>Gift delivery in ${esc(city.name)}, ${esc(city.state)}</p>
			</a>`, eol);
  src = src.replace(cardAnchor, cardAnchor + card);

  if (!DRY) fs.writeFileSync(file, src, 'utf8');
  return 'card + schema added';
}

// ---------------------------------------------------------------------------
// 7. Sitewide footer cities list
// ---------------------------------------------------------------------------

function allCities() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'city-data.json'), 'utf8'));
  const map = new Map();
  for (const c of data) map.set(c.slug, c.name);
  for (const c of CITIES) map.set(c.slug, c.name);
  return [...map.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rebuildFooterList(cities) {
  const files = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html')) files.push(f);
  }
  const prod = path.join(ROOT, 'products');
  if (fs.existsSync(prod)) {
    for (const f of fs.readdirSync(prod)) {
      if (f.endsWith('.html')) files.push('products/' + f);
    }
  }

  const re = /(<div class="footer-col footer-cities">[\s\S]*?<h3>Cities<\/h3>\s*<ul>)([\s\S]*?)(<\/ul>)/;
  let updated = 0, skipped = [];
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    const html = fs.readFileSync(file, 'utf8');
    const m = html.match(re);
    if (!m) { skipped.push(rel); continue; }
    const eol = eolOf(html);
    const liMatch = m[2].match(/([ \t]*)<li>/);
    const indent = liMatch ? liMatch[1] : '\t\t\t\t\t';
    const prefixMatch = m[2].match(/<li><a href="((?:\.\.\/)?)gift-delivery-/);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const list = cities.map((c) => `${indent}<li><a href="${prefix}gift-delivery-${c.slug}.html">${esc(c.name)}</a></li>`).join(eol);
    const next = html.replace(re, `$1${eol}${list}${eol}${indent.slice(0, -1)}</ul>`);
    if (next !== html) {
      if (!DRY) fs.writeFileSync(file, next, 'utf8');
      updated++;
    }
  }
  return { updated, skipped };
}

// ---------------------------------------------------------------------------

function main() {
  const template = fs.readFileSync(path.join(ROOT, TEMPLATE), 'utf8');
  const cities = allCities();
  log(`Sitewide footer cities: ${cities.length}`);

  for (const city of CITIES) {
    const file = path.join(ROOT, `gift-delivery-${city.slug}.html`);
    if (fs.existsSync(file)) {
      log(`page exists: gift-delivery-${city.slug}.html`);
    } else {
      if (!DRY) fs.writeFileSync(file, buildCityPage(template, city), 'utf8');
      log(`page created: gift-delivery-${city.slug}.html`);
    }
    log(`  city-data.json: ${appendCityData(city)}`);
    log(`  pincodes.json:  ${appendPincode(city)}`);
    log(`  keywords.json:  ${appendKeyword(city)}`);
    log(`  sitemap.xml:    ${appendSitemap(city)}`);
    log(`  india page:     ${updateIndiaPage(city)}`);
  }

  const { updated, skipped } = rebuildFooterList(cities);
  log(`footer cities list rebuilt on ${updated} pages` + (skipped.length ? ` (no block: ${skipped.join(', ')})` : ''));
}

main();
