/**
 * db/seed_india_locations.js
 * Seeds all 28 Indian States + 8 UTs with their official districts
 * Uses official Census of India / LGD (Local Government Directory) data
 * Run: node db/seed_india_locations.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ─── Official India States & Union Territories ────────────────────────────────
const INDIA_LOCATIONS = [
  { code: 'AN', name: 'Andaman and Nicobar Islands', region: 'Island', capital: 'Port Blair',
    districts: ['Nicobars','North and Middle Andaman','South Andaman'] },

  { code: 'AP', name: 'Andhra Pradesh', region: 'South', capital: 'Amaravati',
    districts: ['Alluri Sitharama Raju','Anakapalli','Ananthapuramu','Bapatla','Chittoor',
      'Dr. B.R. Ambedkar Konaseema','East Godavari','Eluru','Guntur','Kakinada',
      'Krishna','Kurnool','Manyam','NTR','Nandyal','Nellore','Palnadu','Prakasam',
      'Sri Sathya Sai','Srikakulam','Tirupati','Visakhapatnam','Vizianagaram',
      'West Godavari','YSR Kadapa'] },

  { code: 'AR', name: 'Arunachal Pradesh', region: 'Northeast', capital: 'Itanagar',
    districts: ['Anjaw','Changlang','Dibang Valley','East Kameng','East Siang',
      'Itanagar Capital Complex','Kamle','Kra Daadi','Kurung Kumey','Lepa Rada',
      'Lohit','Longding','Lower Dibang Valley','Lower Siang','Lower Subansiri',
      'Namsai','Pakke-Kessang','Papum Pare','Shi Yomi','Siang','Tawang',
      'Tirap','Upper Siang','Upper Subansiri','West Kameng','West Siang'] },

  { code: 'AS', name: 'Assam', region: 'Northeast', capital: 'Dispur',
    districts: ['Bajali','Baksa','Barpeta','Biswanath','Bongaigaon','Cachar','Charaideo',
      'Chirang','Darrang','Dhemaji','Dhubri','Dibrugarh','Dima Hasao','Goalpara',
      'Golaghat','Hailakandi','Hojai','Jorhat','Kamrup','Kamrup Metropolitan',
      'Karbi Anglong','Karimganj','Kokrajhar','Lakhimpur','Majuli','Morigaon',
      'Nagaon','Nalbari','Sivasagar','Sonitpur','South Salmara-Mankachar',
      'Tamulpur','Tinsukia','Udalguri','West Karbi Anglong'] },

  { code: 'BR', name: 'Bihar', region: 'East', capital: 'Patna',
    districts: ['Araria','Arwal','Aurangabad','Banka','Begusarai','Bhagalpur','Bhojpur',
      'Buxar','Darbhanga','East Champaran','Gaya','Gopalganj','Jamui','Jehanabad',
      'Kaimur','Katihar','Khagaria','Kishanganj','Lakhisarai','Madhepura','Madhubani',
      'Munger','Muzaffarpur','Nalanda','Nawada','Patna','Purnia','Rohtas','Saharsa',
      'Samastipur','Saran','Sheikhpura','Sheohar','Sitamarhi','Siwan','Supaul',
      'Vaishali','West Champaran'] },

  { code: 'CH', name: 'Chandigarh', region: 'North', capital: 'Chandigarh',
    districts: ['Chandigarh'] },

  { code: 'CT', name: 'Chhattisgarh', region: 'Central', capital: 'Raipur',
    districts: ['Balod','Baloda Bazar','Balrampur','Bastar','Bemetara','Bijapur',
      'Bilaspur','Dantewada','Dhamtari','Durg','Gariaband','Gaurela-Pendra-Marwahi',
      'Janjgir-Champa','Jashpur','Kabirdham','Kanker','Khairagarh','Kondagaon',
      'Korba','Koriya','Mahasamund','Manendragarh','Mohla-Manpur','Mungeli',
      'Narayanpur','Raigarh','Raipur','Rajnandgaon','Sarangarh-Bilaigarh','Sukma',
      'Surajpur','Surguja'] },

  { code: 'DD', name: 'Dadra and Nagar Haveli and Daman and Diu', region: 'West', capital: 'Daman',
    districts: ['Dadra and Nagar Haveli','Daman','Diu'] },

  { code: 'DL', name: 'Delhi', region: 'North', capital: 'New Delhi',
    districts: ['Central Delhi','East Delhi','New Delhi','North Delhi','North East Delhi',
      'North West Delhi','Shahdara','South Delhi','South East Delhi','South West Delhi',
      'West Delhi'] },

  { code: 'GA', name: 'Goa', region: 'West', capital: 'Panaji',
    districts: ['North Goa','South Goa'] },

  { code: 'GJ', name: 'Gujarat', region: 'West', capital: 'Gandhinagar',
    districts: ['Ahmedabad','Amreli','Anand','Aravalli','Banaskantha','Bharuch',
      'Bhavnagar','Botad','Chhota Udaipur','Dahod','Dang','Devbhoomi Dwarka',
      'Gandhinagar','Gir Somnath','Jamnagar','Junagadh','Kheda','Kutch',
      'Mahisagar','Mehsana','Morbi','Narmada','Navsari','Panchmahal','Patan',
      'Porbandar','Rajkot','Sabarkantha','Surat','Surendranagar','Tapi',
      'Vadodara','Valsad'] },

  { code: 'HR', name: 'Haryana', region: 'North', capital: 'Chandigarh',
    districts: ['Ambala','Bhiwani','Charkhi Dadri','Faridabad','Fatehabad','Gurugram',
      'Hisar','Jhajjar','Jind','Kaithal','Karnal','Kurukshetra','Mahendragarh',
      'Nuh','Palwal','Panchkula','Panipat','Rewari','Rohtak','Sirsa','Sonipat',
      'Yamunanagar'] },

  { code: 'HP', name: 'Himachal Pradesh', region: 'North', capital: 'Shimla',
    districts: ['Bilaspur','Chamba','Hamirpur','Kangra','Kinnaur','Kullu','Lahaul and Spiti',
      'Mandi','Shimla','Sirmaur','Solan','Una'] },

  { code: 'JK', name: 'Jammu and Kashmir', region: 'North', capital: 'Srinagar/Jammu',
    districts: ['Anantnag','Bandipora','Baramulla','Budgam','Doda','Ganderbal','Jammu',
      'Kathua','Kishtwar','Kulgam','Kupwara','Poonch','Pulwama','Rajouri','Ramban',
      'Reasi','Samba','Shopian','Srinagar','Udhampur'] },

  { code: 'JH', name: 'Jharkhand', region: 'East', capital: 'Ranchi',
    districts: ['Bokaro','Chatra','Deoghar','Dhanbad','Dumka','East Singhbhum',
      'Garhwa','Giridih','Godda','Gumla','Hazaribagh','Jamtara','Khunti','Koderma',
      'Latehar','Lohardaga','Pakur','Palamu','Ramgarh','Ranchi','Sahebganj',
      'Seraikela Kharsawan','Simdega','West Singhbhum'] },

  { code: 'KA', name: 'Karnataka', region: 'South', capital: 'Bengaluru',
    districts: ['Bagalkote','Ballari','Belagavi','Bengaluru Rural','Bengaluru Urban',
      'Bidar','Chamarajanagara','Chikkaballapura','Chikkamagaluru','Chitradurga',
      'Dakshina Kannada','Davanagere','Dharwad','Gadag','Hassan','Haveri',
      'Kalaburagi','Kodagu','Kolar','Koppal','Mandya','Mysuru','Raichur',
      'Ramanagara','Shivamogga','Tumakuru','Udupi','Uttara Kannada',
      'Vijayanagara','Vijayapura','Yadgir'] },

  { code: 'KL', name: 'Kerala', region: 'South', capital: 'Thiruvananthapuram',
    districts: ['Alappuzha','Ernakulam','Idukki','Kannur','Kasaragod','Kollam',
      'Kottayam','Kozhikode','Malappuram','Palakkad','Pathanamthitta','Thiruvananthapuram',
      'Thrissur','Wayanad'] },

  { code: 'LA', name: 'Ladakh', region: 'North', capital: 'Leh',
    districts: ['Kargil','Leh'] },

  { code: 'LD', name: 'Lakshadweep', region: 'Island', capital: 'Kavaratti',
    districts: ['Lakshadweep'] },

  { code: 'MP', name: 'Madhya Pradesh', region: 'Central', capital: 'Bhopal',
    districts: ['Agar Malwa','Alirajpur','Anuppur','Ashoknagar','Balaghat','Barwani',
      'Betul','Bhind','Bhopal','Burhanpur','Chhatarpur','Chhindwara','Damoh',
      'Datia','Dewas','Dhar','Dindori','Guna','Gwalior','Harda','Hoshangabad',
      'Indore','Jabalpur','Jhabua','Katni','Khandwa','Khargone','Maihar',
      'Mandla','Mandsaur','Morena','Narsimhapur','Neemuch','Niwari','Panna',
      'Raisen','Rajgarh','Ratlam','Rewa','Sagar','Satna','Sehore','Seoni',
      'Shahdol','Shajapur','Sheopur','Shivpuri','Sidhi','Singrauli','Tikamgarh',
      'Ujjain','Umaria','Vidisha'] },

  { code: 'MH', name: 'Maharashtra', region: 'West', capital: 'Mumbai',
    districts: ['Ahmednagar','Akola','Amravati','Aurangabad','Beed','Bhandara',
      'Buldhana','Chandrapur','Dhule','Gadchiroli','Gondia','Hingoli','Jalgaon',
      'Jalna','Kolhapur','Latur','Mumbai City','Mumbai Suburban','Nagpur','Nanded',
      'Nandurbar','Nashik','Osmanabad','Palghar','Parbhani','Pune','Raigad',
      'Ratnagiri','Sangli','Satara','Sindhudurg','Solapur','Thane','Wardha',
      'Washim','Yavatmal'] },

  { code: 'MN', name: 'Manipur', region: 'Northeast', capital: 'Imphal',
    districts: ['Bishnupur','Chandel','Churachandpur','Imphal East','Imphal West',
      'Jiribam','Kakching','Kamjong','Kangpokpi','Noney','Pherzawl','Senapati',
      'Tamenglong','Tengnoupal','Thoubal','Ukhrul'] },

  { code: 'ML', name: 'Meghalaya', region: 'Northeast', capital: 'Shillong',
    districts: ['East Garo Hills','East Jaintia Hills','East Khasi Hills',
      'Eastern West Khasi Hills','North Garo Hills','Ri Bhoi','South Garo Hills',
      'South West Garo Hills','South West Khasi Hills','West Garo Hills',
      'West Jaintia Hills','West Khasi Hills'] },

  { code: 'MZ', name: 'Mizoram', region: 'Northeast', capital: 'Aizawl',
    districts: ['Aizawl','Champhai','Hnahthial','Khawzawl','Kolasib','Lawngtlai',
      'Lunglei','Mamit','Saiha','Saitual','Serchhip'] },

  { code: 'NL', name: 'Nagaland', region: 'Northeast', capital: 'Kohima',
    districts: ['Chumoukedima','Dimapur','Kiphire','Kohima','Longleng','Mokokchung',
      'Mon','Niuland','Noklak','Peren','Phek','Shamator','Tseminyu','Tuensang',
      'Wokha','Zunheboto'] },

  { code: 'OD', name: 'Odisha', region: 'East', capital: 'Bhubaneswar',
    districts: ['Angul','Balangir','Balasore','Bargarh','Bhadrak','Boudh','Cuttack',
      'Deogarh','Dhenkanal','Gajapati','Ganjam','Jagatsinghpur','Jajpur','Jharsuguda',
      'Kalahandi','Kandhamal','Kendrapara','Kendujhar','Khordha','Koraput',
      'Malkangiri','Mayurbhanj','Nabarangapur','Nayagarh','Nuapada','Puri',
      'Rayagada','Sambalpur','Subarnapur','Sundargarh'] },

  { code: 'PY', name: 'Puducherry', region: 'South', capital: 'Puducherry',
    districts: ['Karaikal','Mahe','Puducherry','Yanam'] },

  { code: 'PB', name: 'Punjab', region: 'North', capital: 'Chandigarh',
    districts: ['Amritsar','Barnala','Bathinda','Faridkot','Fatehgarh Sahib',
      'Fazilka','Ferozepur','Gurdaspur','Hoshiarpur','Jalandhar','Kapurthala',
      'Ludhiana','Malerkotla','Mansa','Moga','Mohali','Muktsar','Nawanshahr',
      'Pathankot','Patiala','Rupnagar','Sangrur','Tarn Taran'] },

  { code: 'RJ', name: 'Rajasthan', region: 'North', capital: 'Jaipur',
    districts: ['Ajmer','Alwar','Anupgarh','Balotra','Banswara','Baran','Barmer',
      'Beawar','Bharatpur','Bhilwara','Bikaner','Bundi','Chittorgarh','Churu',
      'Dausa','Deeg','Dholpur','Didwana-Kuchaman','Dudu','Dungarpur',
      'Ganganagar','Gangapur City','Hanumangarh','Jaipur','Jaipur Rural',
      'Jaisalmer','Jalore','Jhalawar','Jhunjhunu','Jodhpur','Jodhpur Rural',
      'Karauli','Kekri','Khairthal-Tijara','Kotputli-Behror','Kota','Nagaur',
      'Neem Ka Thana','Pali','Phalodi','Pratapgarh','Rajsamand','Salumbar',
      'Sanchore','Sawai Madhopur','Shahpura','Sikar','Sirohi','Tonk','Udaipur'] },

  { code: 'SK', name: 'Sikkim', region: 'Northeast', capital: 'Gangtok',
    districts: ['Gyalshing','Namchi','Pakyong','Soreng','Gangtok','Mangan'] },

  { code: 'TN', name: 'Tamil Nadu', region: 'South', capital: 'Chennai',
    districts: ['Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore',
      'Dharmapuri','Dindigul','Erode','Kallakurichi','Kancheepuram','Kanyakumari',
      'Karur','Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam','Namakkal',
      'Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet','Salem',
      'Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi','Tiruchirappalli',
      'Tirunelveli','Tirupathur','Tiruppur','Tiruvallur','Tiruvannamalai',
      'Tiruvarur','Vellore','Viluppuram','Virudhunagar'] },

  { code: 'TG', name: 'Telangana', region: 'South', capital: 'Hyderabad',
    districts: ['Adilabad','Bhadradri Kothagudem','Hanumakonda','Hyderabad','Jagtial',
      'Jangaon','Jayashankar Bhupalpally','Jogulamba Gadwal','Kamareddy',
      'Karimnagar','Khammam','Kumuram Bheem','Mahabubabad','Mahbubnagar',
      'Mancherial','Medak','Medchal-Malkajgiri','Mulugu','Nagarkurnool',
      'Nalgonda','Narayanpet','Nirmal','Nizamabad','Peddapalli','Rajanna Sircilla',
      'Rangareddy','Sangareddy','Siddipet','Suryapet','Vikarabad','Wanaparthy',
      'Warangal','Yadadri Bhuvanagiri'] },

  { code: 'TR', name: 'Tripura', region: 'Northeast', capital: 'Agartala',
    districts: ['Dhalai','Gomati','Khowai','North Tripura','Sepahijala',
      'Sipahijala','South Tripura','Unakoti','West Tripura'] },

  { code: 'UP', name: 'Uttar Pradesh', region: 'North', capital: 'Lucknow',
    districts: ['Agra','Aligarh','Ambedkar Nagar','Amethi','Amroha','Auraiya',
      'Ayodhya','Azamgarh','Baghpat','Bahraich','Ballia','Balrampur','Banda',
      'Barabanki','Bareilly','Basti','Bhadohi','Bijnor','Budaun','Bulandshahr',
      'Chandauli','Chitrakoot','Deoria','Etah','Etawah','Farrukhabad','Fatehpur',
      'Firozabad','Gautam Buddha Nagar','Ghaziabad','Ghazipur','Gonda','Gorakhpur',
      'Hamirpur','Hapur','Hardoi','Hathras','Jalaun','Jaunpur','Jhansi',
      'Kannauj','Kanpur Dehat','Kanpur Nagar','Kasganj','Kaushambi','Kheri',
      'Kushinagar','Lalitpur','Lucknow','Maharajganj','Mahoba','Mainpuri',
      'Mathura','Mau','Meerut','Mirzapur','Moradabad','Muzaffarnagar','Pilibhit',
      'Pratapgarh','Prayagraj','Rae Bareli','Rampur','Saharanpur','Sambhal',
      'Sant Kabir Nagar','Shahjahanpur','Shamli','Shravasti','Siddharthnagar',
      'Sitapur','Sonbhadra','Sultanpur','Unnao','Varanasi'] },

  { code: 'UK', name: 'Uttarakhand', region: 'North', capital: 'Dehradun',
    districts: ['Almora','Bageshwar','Chamoli','Champawat','Dehradun','Haridwar',
      'Nainital','Pauri Garhwal','Pithoragarh','Rudraprayag','Tehri Garhwal',
      'Udham Singh Nagar','Uttarkashi'] },

  { code: 'WB', name: 'West Bengal', region: 'East', capital: 'Kolkata',
    districts: ['Alipurduar','Bankura','Birbhum','Cooch Behar','Dakshin Dinajpur',
      'Darjeeling','Hooghly','Howrah','Jalpaiguri','Jhargram','Kalimpong',
      'Kolkata','Malda','Murshidabad','Nadia','North 24 Parganas','Paschim Bardhaman',
      'Paschim Medinipur','Purba Bardhaman','Purba Medinipur','Purulia',
      'South 24 Parganas','Uttar Dinajpur'] },
];

// ─── Official Indian Languages ────────────────────────────────────────────────
const INDIA_LANGUAGES = [
  // 22 Scheduled Languages (8th Schedule)
  'Assamese','Bengali','Bodo','Dogri','Gujarati','Hindi','Kannada','Kashmiri',
  'Konkani','Maithili','Malayalam','Manipuri','Marathi','Nepali','Odia',
  'Punjabi','Sanskrit','Santali','Sindhi','Tamil','Telugu','Urdu',
  // Major regional/additional languages
  'English','Bhili','Gondi','Tulu','Rajasthani','Chhattisgarhi','Haryanvi',
  'Bhojpuri','Magahi','Awadhi','Bundeli','Garhwali','Kumaoni',
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Seed states
    for (const state of INDIA_LOCATIONS) {
      await client.query(`
        INSERT INTO india_states (code, name, region, capital)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, region=EXCLUDED.region, capital=EXCLUDED.capital
      `, [state.code, state.name, state.region, state.capital]);

      // Seed districts
      for (const district of state.districts) {
        await client.query(`
          INSERT INTO india_districts (state_code, name)
          VALUES ($1, $2)
          ON CONFLICT (state_code, name) DO NOTHING
        `, [state.code, district]);
      }
    }

    // Store languages as a simple config entry (use a simple config table or app_settings)
    // We'll store them in a simple key-value if table exists, else skip
    const tableCheck = await client.query(
      `SELECT to_regclass('public.app_settings') AS tbl`
    );
    if (tableCheck.rows[0].tbl) {
      await client.query(`
        INSERT INTO app_settings (key, value)
        VALUES ('india_languages', $1)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value
      `, [JSON.stringify(INDIA_LANGUAGES)]);
    }

    await client.query('COMMIT');
    console.log(`✅ Seeded ${INDIA_LOCATIONS.length} states/UTs with all districts`);
    console.log(`✅ ${INDIA_LANGUAGES.length} languages registered`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

// Export for use in other modules
module.exports = { INDIA_LOCATIONS, INDIA_LANGUAGES };
