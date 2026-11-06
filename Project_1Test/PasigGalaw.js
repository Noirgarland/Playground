"use strict";

const form = document.getElementById("reportForm");
const locationField = document.getElementById("location");
const latitudeField = document.getElementById("latitude");
const longitudeField = document.getElementById("longitude");
const photoField = document.getElementById("photo");
const photoPreview = document.getElementById("imagePreview");
const searchButton = document.getElementById("searchLocation");
const locationError = document.getElementById("locationError");
const confirmation = document.getElementById("reportConfirmation");

const pasigCenter = [14.5764, 121.0851];
const map = L.map("map").setView(pasigCenter, 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let marker = null;
let photoObjectUrl = "";
let searchSequence = 0;
let lastSearchTime = 0;

function showLocationError(message) {
    locationError.textContent = message;
    locationError.hidden = false;
}

function clearLocationError() {
    locationError.textContent = "";
    locationError.hidden = true;
}

function clearCoordinates() {
    latitudeField.value = "";
    longitudeField.value = "";
}

function setSelectedLocation(latLng, label) {
    const lat = Number(latLng.lat);
    const lng = Number(latLng.lng);
    latitudeField.value = lat.toFixed(6);
    longitudeField.value = lng.toFixed(6);
    locationField.value = label || `Pinned location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;

    if (!marker) {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on("dragend", () => {
            const point = marker.getLatLng();
            setSelectedLocation(point, `Pinned location (${point.lat.toFixed(6)}, ${point.lng.toFixed(6)})`);
        });
    } else {
        marker.setLatLng([lat, lng]);
    }

    marker.bindPopup("Issue location");
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
    clearLocationError();
}

map.on("click", (event) => {
    searchSequence++;
    searchButton.disabled = false;
    searchButton.textContent = "Search";
    setSelectedLocation(event.latlng);
});

// Use Nominatim only for explicit searches (button/Enter), not per keystroke.
// Its public service asks users to keep requests to at most one per second.
async function searchAddress() {
    const query = locationField.value.trim();
    if (!query) {
        showLocationError("Enter an address or place name to search.");
        locationField.focus();
        return;
    }

    const requestId = ++searchSequence;
    clearCoordinates();
    clearLocationError();
    searchButton.disabled = true;
    searchButton.textContent = "Searching…";

    try {
        const wait = Math.max(0, 1000 - (Date.now() - lastSearchTime));
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        if (requestId !== searchSequence) return;
        lastSearchTime = Date.now();

        const params = new URLSearchParams({
            format: "jsonv2",
            limit: "1",
            countrycodes: "ph",
            q: query
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
        if (!response.ok) throw new Error("Search service unavailable");
        const results = await response.json();
        if (requestId !== searchSequence) return;

        if (!results.length) {
            showLocationError("No matching place found. Try another search or pin the map directly.");
            return;
        }

        const result = results[0];
        setSelectedLocation(
            { lat: Number(result.lat), lng: Number(result.lon) },
            result.display_name
        );
    } catch (error) {
        if (requestId === searchSequence) {
            showLocationError("Could not search right now. You can still select the location by clicking the map.");
        }
    } finally {
        if (requestId === searchSequence) {
            searchButton.disabled = false;
            searchButton.textContent = "Search";
        }
    }
}

searchButton.addEventListener("click", searchAddress);
locationField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        searchAddress();
    }
});
locationField.addEventListener("input", () => {
    // A changed query must not submit the old coordinates by mistake.
    searchSequence++;
    clearCoordinates();
    clearLocationError();
    searchButton.disabled = false;
    searchButton.textContent = "Search";
});

photoField.addEventListener("change", () => {
    const file = photoField.files && photoField.files[0];
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = "";

    if (!file) {
        photoPreview.removeAttribute("src");
        photoPreview.style.display = "none";
        return;
    }
    if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        photoField.value = "";
        photoPreview.removeAttribute("src");
        photoPreview.style.display = "none";
        return;
    }

    photoObjectUrl = URL.createObjectURL(file);
    photoPreview.src = photoObjectUrl;
    photoPreview.style.display = "block";
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!latitudeField.value || !longitudeField.value) {
        showLocationError("Search for a location or click/drag the pin on the map before continuing.");
        locationField.focus();
        return;
    }

    const report = {
        name: document.getElementById("name").value.trim(),
        location: locationField.value.trim(),
        latitude: latitudeField.value,
        longitude: longitudeField.value,
        category: document.getElementById("category").value,
        reason: document.getElementById("reason").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        photoName: photoField.files[0]?.name || "No photo attached",
        photoUrl: photoObjectUrl
    };

    form.hidden = true;
    renderReportPreview(report);
});

function renderReportPreview(report) {
    confirmation.hidden = false;
    confirmation.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Review your report";
    const note = document.createElement("p");
    note.textContent = "Check that the information below is correct. Choose Edit to make changes or confirm to complete.";
    const details = document.createElement("dl");

    [
        ["Name", report.name],
        ["Location", report.location],
        ["Coordinates", `${report.latitude}, ${report.longitude}`],
        ["Issue", report.category],
        ["Problem", report.reason],
        ["Contact", report.contact],
        ["Photo", report.photoName]
    ].forEach(([label, value]) => {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value;
        details.append(term, description);
    });

    confirmation.append(heading, note, details);

    if (report.photoUrl) {
        const image = document.createElement("img");
        image.src = report.photoUrl;
        image.alt = "Attached report photo preview";
        image.className = "report-photo-preview";
        confirmation.append(image);
    }

    const actions = document.createElement("div");
    actions.className = "review-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-report-btn";
    editButton.textContent = "Edit report";
    editButton.addEventListener("click", () => {
        confirmation.hidden = true;
        form.hidden = false;
        document.getElementById("name").focus();
        map.invalidateSize();
    });

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "confirm-report-btn";
    confirmButton.textContent = "Confirm and complete";
    confirmButton.addEventListener("click", () => renderCompletion(report));
    actions.append(editButton, confirmButton);
    confirmation.append(actions);
    confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderCompletion(report) {
    confirmation.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = "Report complete";
    const message = document.createElement("p");
    message.textContent = `Thank you, ${report.name}. You confirmed that the report information is correct.`;
    const note = document.createElement("p");
    note.textContent = "This completes the front-end flow. The report has not been sent or saved.";
    const newReportButton = document.createElement("button");
    newReportButton.type = "button";
    newReportButton.className = "confirm-report-btn";
    newReportButton.textContent = "Create another report";
    newReportButton.addEventListener("click", startNewReport);
    confirmation.append(heading, message, note, newReportButton);
    confirmation.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function startNewReport() {
    form.reset();
    form.hidden = false;
    confirmation.hidden = true;
    confirmation.replaceChildren();
    clearCoordinates();
    clearLocationError();
    if (marker) map.removeLayer(marker);
    marker = null;
    photoPreview.removeAttribute("src");
    photoPreview.style.display = "none";
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    photoObjectUrl = "";
    window.scrollTo({ top: form.offsetTop, behavior: "smooth" });
}
