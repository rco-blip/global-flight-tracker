const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const COUNTRIES_GEOJSON_URL = 'https://unpkg.com/three-globe/example/datasets/ne_110m_admin_0_countries.geojson';
const CLOSED_AIRSPACES = {
    crimson: ['Iran', 'Iraq', 'Syria', 'Lebanon', 'Israel', 'Yemen', 'Palestine', 'Jordan'],
    orange: ['Ukraine', 'Russia', 'Belarus', 'North Korea'],
    yellow: ['Sudan', 'South Sudan', 'Libya', 'Niger', 'Mali', 'Afghanistan', 'Somalia']
};

function getCountryColor(cname, type) {
    if (CLOSED_AIRSPACES.crimson.includes(cname)) {
        if (type === 'cap') return 'rgba(255, 20, 80, 0.45)';
        if (type === 'side') return 'rgba(255, 20, 80, 0.15)';
        return '#ff1450';
    }
    if (CLOSED_AIRSPACES.orange.includes(cname)) {
        if (type === 'cap') return 'rgba(255, 140, 0, 0.45)';
        if (type === 'side') return 'rgba(255, 140, 0, 0.15)';
        return '#ff8c00';
    }
    if (CLOSED_AIRSPACES.yellow.includes(cname)) {
        if (type === 'cap') return 'rgba(255, 230, 0, 0.35)';
        if (type === 'side') return 'rgba(255, 230, 0, 0.15)';
        return '#ffe600';
    }
    
    // Default styles for the rest of the 190+ countries
    // Cap: Frosted Glass / Light Blue to pop against the black oceans
    if (type === 'cap') return 'rgba(120, 200, 255, 0.08)';
    // Side: Very faint blue to give 3D depth and avoid Z-fighting glitches
    if (type === 'side') return 'rgba(0, 229, 255, 0.05)';
    // Stroke: Glowing cyan borders
    return '#00ffff'; 
}

let globeInstance;
let allFlights = [];

function logDebug(msg) {
    console.log(msg);
    const d = document.getElementById('debug-log');
    if(d) d.innerText += '\n' + msg;
}

const jetShape = new THREE.Shape();
jetShape.moveTo(0, 1.2);
jetShape.lineTo(0.5, -1);
jetShape.lineTo(0, -0.5);
jetShape.lineTo(-0.5, -1);
jetShape.closePath();

const jetGeometry = new THREE.ShapeGeometry(jetShape);
const material = new THREE.MeshBasicMaterial({ 
    color: 0x00e5ff, 
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
});

function createAirplaneMesh(flight) {
    const mesh = new THREE.Mesh(jetGeometry, material);
    mesh.scale.set(0.15, 0.15, 0.15); 
    if (flight.heading) {
        mesh.rotation.z = -flight.heading * (Math.PI / 180);
    }
    return mesh;
}

function processData(states) {
    return states.filter(s => s[5] != null && s[6] != null).map(s => ({
        icao24: s[0],
        callsign: s[1] ? s[1].trim() : 'UNKNOWN',
        country: s[2],
        lng: s[5],
        lat: s[6],
        alt: s[7] || 0,
        velocity: s[9] || 0,
        heading: s[10] || 0
    }));
}

function generateDummyData() {
    const dummies = [];
    const airports = ['JFK (New York)', 'LHR (London)', 'DXB (Dubai)', 'HND (Tokyo)', 'CDG (Paris)', 'FRA (Frankfurt)', 'LAX (Los Angeles)', 'SIN (Singapore)', 'SYD (Sydney)', 'YYZ (Toronto)'];
    
    for(let i=0; i<5000; i++) {
        const origin = airports[Math.floor(Math.random() * airports.length)];
        let dest = airports[Math.floor(Math.random() * airports.length)];
        while(dest === origin) dest = airports[Math.floor(Math.random() * airports.length)];

        dummies.push({
            icao24: 'dummy' + i,
            callsign: 'FLT' + Math.floor(Math.random() * 9000 + 1000),
            country: 'International',
            lng: (Math.random() - 0.5) * 360,
            lat: (Math.random() - 0.5) * 180,
            alt: Math.random() * 10000 + 3000,
            velocity: Math.random() * 250 + 50,
            heading: Math.random() * 360,
            origin: origin,
            destination: dest,
            isSimulation: true
        });
    }
    return dummies;
}

function initGlobe() {
    try {
        logDebug("Initializing Globe...");
        const elem = document.getElementById('globeViz');
        
        if (typeof Globe === 'undefined') {
            throw new Error("Globe.gl is not loaded. Network issue?");
        }
        if (typeof THREE === 'undefined') {
            throw new Error("Three.js is not loaded.");
        }
        
        globeInstance = Globe()(elem)
            .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
            .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
            .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
            .showAtmosphere(true)
            .atmosphereColor('#00e5ff')
            .atmosphereAltitude(0.15)
            .polygonsData([])
            .polygonAltitude(0.008) // The sweet spot for 3D extrusion depth
            .polygonsTransitionDuration(300) // smooth rendering
            .polygonSideColor(feat => {
                const props = feat.properties || {};
                const cname = props.ADMIN || props.NAME || props.name || '';
                return getCountryColor(cname, 'side');
            })
            .polygonCapColor(feat => {
                const props = feat.properties || {};
                const cname = props.ADMIN || props.NAME || props.name || '';
                return getCountryColor(cname, 'cap');
            })
            .polygonStrokeColor(feat => {
                const props = feat.properties || {};
                const cname = props.ADMIN || props.NAME || props.name || '';
                return getCountryColor(cname, 'stroke');
            })
            .objectsData([])
            .objectLat('lat')
            .objectLng('lng')
            .objectAltitude(d => Math.max(0.01, d.alt / 150000))
            .objectThreeObject(createAirplaneMesh)
            .objectLabel(d => `<div style="text-align:center; background: rgba(10,15,30,0.8); padding: 5px 10px; border-radius: 5px; border: 1px solid rgba(0,229,255,0.4); font-family: 'Inter', sans-serif;"><b>${d.callsign}</b><br/>${d.country}</div>`)
            .onObjectClick(handleFlightClick)
            .onObjectHover(flight => {
                elem.style.cursor = flight ? 'pointer' : 'default';
            });

        // User disabled auto-rotation to allow manual click and drag navigation
        globeInstance.controls().autoRotate = false;
        
        // Starting Point of View
        globeInstance.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

        window.addEventListener('resize', () => {
            globeInstance.width(window.innerWidth);
            globeInstance.height(window.innerHeight);
        });

        logDebug("Applying country borders from local data...");
        try {
            globeInstance.polygonsData(COUNTRIES_DATA.features);
        } catch(err) {
            logDebug("Failed to apply country borders: " + err.message);
        }

        logDebug("Globe init complete, fetching data...");
        fetchData();
        setInterval(fetchData, 180000); // 3-minute update to completely avoid OpenSky blocklists
    } catch(err) {
        logDebug("Error init: " + err.message);
        document.getElementById('loading-txt').innerText = "Init Error: " + err.message;
        hideLoading();
    }
}

function handleFlightClick(flight) {
    if(!flight) return;
    globeInstance.controls().autoRotate = false;
    const infoPanel = document.getElementById('flight-info');
    infoPanel.style.display = 'block';
    document.getElementById('fi-callsign').textContent = flight.callsign;
    document.getElementById('fi-country').textContent = flight.country;
    
    // Determine origin and destination displays
    if (flight.isSimulation) {
        document.getElementById('fi-origin').textContent = flight.origin;
        document.getElementById('fi-dest').textContent = flight.destination;
    } else {
        document.getElementById('fi-origin').textContent = flight.country; // OpenSky provides origin country
        document.getElementById('fi-dest').textContent = "Unknown (Radar Tracking)"; // Raw ADS-B doesn't give flight plans
    }
    
    document.getElementById('fi-altitude').textContent = Math.round(flight.alt).toLocaleString() + ' m';
    document.getElementById('fi-velocity').textContent = Math.round(flight.velocity * 3.6).toLocaleString() + ' km/h';
    document.getElementById('fi-coords').textContent = `${flight.lat.toFixed(4)}°, ${flight.lng.toFixed(4)}°`;
    globeInstance.pointOfView({ lat: flight.lat, lng: flight.lng, altitude: 0.6 }, 1500);
}

function hideLoading() {
    logDebug("Hiding loading mask...");
    const loading = document.getElementById('loading');
    if(loading) {
        loading.style.opacity = '0';
        setTimeout(() => loading.style.display = 'none', 800);
    }
}

function updateUIAndData(flights) {
    try {
        logDebug("Updating UI with " + flights.length + " flights");
        // Display up to 6000 flights to keep it highly populated without crashing the browser
        const displayFlights = flights.slice(0, 6000); 
        globeInstance.objectsData(displayFlights);
        
        document.getElementById('flight-count').textContent = displayFlights.length.toLocaleString() + ' (Displayed)';
        const now = new Date();
        document.getElementById('last-updated').textContent = now.toLocaleTimeString(undefined, {
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit', 
            timeZoneName: 'short'
        });
        
        hideLoading();
    } catch(err) {
        logDebug("Error updating UI: " + err.message);
    }
}

function fetchData() {
    logDebug("Fetching OPENSKY...");
    fetch(OPENSKY_URL)
        .then(res => {
            if(!res.ok) throw new Error("Status " + res.status);
            return res.json();
        })
        .then(data => {
            logDebug("Data received.");
            allFlights = processData(data.states || []);
            
            // Hide simulation badge if API starts succeeding again
            const badge = document.getElementById('simulation-badge');
            if (badge) badge.style.display = 'none';

            updateUIAndData(allFlights);
        })
        .catch(err => {
            logDebug("Fetch catch: " + err.message);
            const lastUpdatedElem = document.getElementById('last-updated');
            lastUpdatedElem.textContent = 'Simulator Active';
            lastUpdatedElem.style.color = '#ff4081'; 
            
            // Show glaring simulation badge
            const badge = document.getElementById('simulation-badge');
            if (badge) badge.style.display = 'block';
            
            if (allFlights.length === 0) {
                logDebug("Generating dummies...");
                allFlights = generateDummyData();
            } else {
                allFlights.forEach(f => {
                    const speed = f.velocity / 1000;
                    f.lng += speed * Math.sin(f.heading * Math.PI / 180);
                    f.lat += speed * Math.cos(f.heading * Math.PI / 180);
                });
            }
            updateUIAndData(allFlights);
        });
}

// Ensure initGlobe runs properly
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobe);
} else {
    initGlobe();
}
