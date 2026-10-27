(function () {
	'use strict';

	var CURRENT_YEAR = new Date().getFullYear();
	var OBLIQUE_API_URL = DATAFORSYNINGEN_URL + '/rest/skraafoto_api/v2/search';
	var OBLIQUE_GROUND_ELEVATION = 20;
	var OBLIQUE_CROP_SIZE = 768;
	var GEOTIFF_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js';
	var geoTiffLibraryPromise = null;
	var activeObliquePreview = null;
	var map;
	var buildingLayer;
	var canvasRenderer;
	var obliqueLink;
	var activeBaseLayer;
	var activeLayerAttribution = '© OpenStreetMap contributors';
	var allFeatures = [];
	var pointFeaturesCache = [];
	var selectedId = null;
	var selectedYear = null;
	var selectedPointStep = null;
	var animationMode = 'year';
	var requestSerial = 0;
	var renderingFeatures = false;
	var animationTimer = null;
	var animationStartTime = 0;
	var animationStartValue = 0;
	var exportControlStates = null;
	var exportCancelRequested = false;
	var status = document.getElementById('status');
	var slider = document.getElementById('year-slider');
	var sliderGradientElement = document.getElementById('year-slider-gradient');
	var yearHistogram = document.getElementById('year-histogram');
	var yearHeading = document.getElementById('year-heading');
	var yearSliderWrap = document.getElementById('year-slider-wrap');
	var yearRange = document.querySelector('.year-range');
	var timelineToolbar = document.getElementById('timeline-toolbar');
	var exportControls = document.getElementById('export-controls');
	var yearValue = document.getElementById('year-value');
	var timelineLabel = document.getElementById('timeline-label');
	var animationModeSelect = document.getElementById('animation-mode');
	var showInvalid = document.getElementById('show-invalid');
	var yearStartButton = document.getElementById('year-start');
	var yearBackButton = document.getElementById('year-back');
	var yearPlayButton = document.getElementById('year-play');
	var yearForwardButton = document.getElementById('year-forward');
	var yearEndButton = document.getElementById('year-end');
	var yearSpeed = document.getElementById('year-speed');
	var exportButton = document.getElementById('export-video');
	var cancelExportButton = document.getElementById('cancel-export');
	var exportStatus = document.getElementById('export-status');
	var aboutToggle = document.getElementById('about-toggle');
	var serviceInfoText = document.getElementById('service-info-text');
	var addressInput = document.getElementById('address-input');
	var addressResultsList = document.getElementById('address-results');
	var addressStatus = document.getElementById('address-status');
	var addressSearchTimer = null;
	var addressSearchSerial = 0;
	var addressResults = [];
	var highlightedAddress = -1;
	var pendingAddress = null;

	function utm32ToLatLng(x, y) {
		var a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
		var e2 = f * (2 - f), ep2 = e2 / (1 - e2);
		var m = y / k0;
		var mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
		var e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
		var phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
			+ (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
			+ (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
			+ (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
		var s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1);
		var n = a / Math.sqrt(1 - e2 * s * s);
		var t1 = t * t, c1 = ep2 * c * c;
		var r = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5);
		var d = (x - 500000) / (n * k0);
		var lat = phi1 - (n * t / r) * (d * d / 2
			- (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * Math.pow(d, 4) / 24
			+ (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * Math.pow(d, 6) / 720);
		var lng = (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6
			+ (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * Math.pow(d, 5) / 120) / c;
		return [lat * 180 / Math.PI, 9 + lng * 180 / Math.PI];
	}

	function latLngToUtm32(lat, lng) {
		var a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
		var e2 = f * (2 - f), ep2 = e2 / (1 - e2);
		var phi = lat * Math.PI / 180;
		var s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
		var n = a / Math.sqrt(1 - e2 * s * s);
		var t2 = t * t, c2 = ep2 * c * c;
		var aa = (lng - 9) * Math.PI / 180 * c;
		var m = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * phi
			- (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * phi)
			+ (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * phi)
			- (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * phi));
		var x = 500000 + k0 * n * (aa + (1 - t2 + c2) * Math.pow(aa, 3) / 6
			+ (5 - 18 * t2 + t2 * t2 + 72 * c2 - 58 * ep2) * Math.pow(aa, 5) / 120);
		var y = k0 * (m + n * t * (aa * aa / 2
			+ (5 - t2 + 9 * c2 + 4 * c2 * c2) * Math.pow(aa, 4) / 24
			+ (61 - 58 * t2 + t2 * t2 + 600 * c2 - 330 * ep2) * Math.pow(aa, 6) / 720));
		return [x, y];
	}

	function wktToLatLng(wkt) {
		var match = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/.exec(wkt || '');
		return match ? utm32ToLatLng(Number(match[1]), Number(match[2])) : null;
	}

	function fetchJson(url, options) {
		return fetch(url, options).then(function (response) {
			if (!response.ok) {
				throw new Error('HTTP ' + response.status);
			}
			return response.json();
		});
	}

	function searchAddresses(text, maximum, types) {
		var url = ADRESSEVAELGER_URL + '/soeg?token=' + encodeURIComponent(ADRESSEVAELGER_TOKEN)
			+ '&tekst=' + encodeURIComponent(text)
			+ '&maksimum=' + (maximum || 30)
			+ '&maal=' + encodeURIComponent(types || 'husnummer,navngivenvejpostnummer');
		return fetchJson(url).then(function (data) {
			return data.fund || [];
		});
	}

	function graphql(query) {
		return fetchJson(DATAFORDELER_GRAPHQL_URL + '?apiKey=' + encodeURIComponent(DATAFORDELER_APIKEY), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: query })
		}).then(function (data) {
			if (data.errors && data.errors.length) {
				throw new Error(data.errors[0].message);
			}
			return data.data || {};
		});
	}

	var HUSNUMMER_FIELDS = 'id_lokalId husnummertekst husnummerHoererTilNavngivenVej { vejnavn } '
		+ 'husnummerHoererTilIPostnummer { navn postnr } HusnummerHarAdgangspunkt { position { wkt } }';

	function fetchAddress(id) {
		var query = 'query { DAR_Husnummer(first: 1, virkningstid: "' + new Date().toISOString()
			+ '", where: { id_lokalId: { in: [' + JSON.stringify(id) + '] } }) { nodes { '
			+ HUSNUMMER_FIELDS + ' } } }';
		return graphql(query).then(function (data) {
			var nodes = data.DAR_Husnummer && data.DAR_Husnummer.nodes || [];
			var latlng = nodes.length && nodes[0].HusnummerHarAdgangspunkt
				&& nodes[0].HusnummerHarAdgangspunkt.position
				&& wktToLatLng(nodes[0].HusnummerHarAdgangspunkt.position.wkt);
			if (!latlng) {
				throw new Error('Adressen har ingen gyldige koordinater');
			}
			return latlng;
		});
	}

	function normalizeAddress(value) {
		return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
			.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
			.replace(/[^a-z0-9]/g, '');
	}

	function closeAddressResults() {
		addressResults = [];
		highlightedAddress = -1;
		addressResultsList.textContent = '';
		addressResultsList.style.display = 'none';
		addressInput.setAttribute('aria-expanded', 'false');
	}

	function renderAddressResults(items, message) {
		addressResults = items;
		highlightedAddress = -1;
		addressResultsList.textContent = '';
		if (!items.length) {
			var empty = document.createElement('li');
			empty.textContent = message || 'Ingen adresser fundet';
			addressResultsList.appendChild(empty);
		}
		items.forEach(function (item, index) {
			var row = document.createElement('li');
			var button = document.createElement('button');
			button.type = 'button';
			button.setAttribute('role', 'option');
			button.textContent = item.type === 'navngivenvejpostnummer'
				? item.titel + ' (vej)' : item.titel;
			button.addEventListener('mousedown', function (event) {
				event.preventDefault();
			});
			button.addEventListener('click', function () {
				selectAddress(item);
			});
			row.appendChild(button);
			addressResultsList.appendChild(row);
		});
		addressResultsList.style.display = 'block';
		addressInput.setAttribute('aria-expanded', 'true');
		var addressCount = items.filter(function (item) { return item.type === 'husnummer'; }).length;
		addressStatus.textContent = items.length
			? addressCount === items.length
				? items.length + ' adresser fundet'
				: items.length + ' forslag fundet'
			: message || 'Ingen adresser fundet';
	}

	function highlightAddress(index) {
		if (!addressResults.length) {
			return;
		}
		highlightedAddress = (index + addressResults.length) % addressResults.length;
		var buttons = addressResultsList.querySelectorAll('button');
		buttons.forEach(function (button, buttonIndex) {
			button.classList.toggle('active', buttonIndex === highlightedAddress);
			button.setAttribute('aria-selected', buttonIndex === highlightedAddress ? 'true' : 'false');
		});
		buttons[highlightedAddress].scrollIntoView({ block: 'nearest' });
	}

	function setupAddressSearch() {
		addressInput.addEventListener('input', function () {
			clearTimeout(addressSearchTimer);
			var text = addressInput.value.trim();
			var serial = ++addressSearchSerial;
			pendingAddress = null;
			addressStatus.textContent = '';
			if (text.length < 2) {
				closeAddressResults();
				return;
			}
			closeAddressResults();
			addressSearchTimer = setTimeout(function () {
				addressStatus.textContent = 'Søger adresser …';
				searchAddresses(text).then(function (items) {
					if (serial === addressSearchSerial) {
						renderAddressResults(items);
					}
				}).catch(function (error) {
					if (serial === addressSearchSerial) {
						closeAddressResults();
						addressStatus.textContent = 'Adresseopslag mislykkedes: ' + error.message;
					}
				});
			}, 200);
		});
		addressInput.addEventListener('keydown', function (event) {
			if (event.key === 'ArrowDown') {
				highlightAddress(highlightedAddress + 1);
				event.preventDefault();
			} else if (event.key === 'ArrowUp') {
				highlightAddress(highlightedAddress - 1);
				event.preventDefault();
			} else if (event.key === 'Escape') {
				closeAddressResults();
			} else if (event.key === 'Enter') {
				if (highlightedAddress >= 0) {
					selectAddress(addressResults[highlightedAddress]);
					event.preventDefault();
				} else if (addressResults.length === 1) {
					selectAddress(addressResults[0]);
					event.preventDefault();
				}
			}
		});
		addressInput.addEventListener('blur', function () {
			setTimeout(closeAddressResults, 150);
		});
	}

	function selectRoad(road) {
		clearTimeout(addressSearchTimer);
		var serial = ++addressSearchSerial;
		addressInput.value = road.titel;
		closeAddressResults();
		if (!road.vejnavn || !road.postnr || !road.postdistrikt) {
			addressStatus.textContent = 'Vejopslaget mangler postnummer eller vejoplysninger.';
			return;
		}
		addressStatus.textContent = 'Henter adresser på vejen …';
		searchAddresses(road.vejnavn + ' ' + road.postnr, 200, 'husnummer').then(function (found) {
			if (serial !== addressSearchSerial) {
				return;
			}
			var suffix = ' ' + road.postnr + ' ' + road.postdistrikt;
			var addresses = found.filter(function (item) {
				return item.type === 'husnummer'
					&& item.vejnavn === road.vejnavn
					&& item.titel.slice(-suffix.length) === suffix;
			});
			renderAddressResults(addresses, 'Ingen adresser fundet på vejen');
			if (addresses.length) {
				addressStatus.textContent = addresses.length + ' adresser på ' + road.titel;
			}
		}).catch(function (error) {
			if (serial === addressSearchSerial) {
				closeAddressResults();
				addressStatus.textContent = 'Kunne ikke hente adresser på vejen: ' + error.message;
			}
		});
	}

	function selectAddress(address) {
		if (address.type === 'navngivenvejpostnummer') {
			selectRoad(address);
			return;
		}
		if (address.type !== 'husnummer') {
			addressStatus.textContent = 'Denne type adresseforslag kan ikke vælges.';
			return;
		}
		clearTimeout(addressSearchTimer);
		var serial = ++addressSearchSerial;
		addressInput.value = address.titel;
		closeAddressResults();
		addressStatus.textContent = 'Finder adressen …';
		fetchAddress(address.id).then(function (latlng) {
			if (serial !== addressSearchSerial) {
				return;
			}
			pendingAddress = {
				normalized: normalizeAddress(address.titel),
				title: address.titel
			};
			selectedId = null;
			var zoom = Math.max(map.getZoom(), ADDRESS_SEARCH_ZOOM_LEVEL);
			var target = L.latLng(latlng[0], latlng[1]);
			var center = map.getCenter();
			var viewChanges = map.getZoom() !== zoom
				|| Math.abs(center.lat - target.lat) > 1e-6
				|| Math.abs(center.lng - target.lng) > 1e-6;
			if (viewChanges) {
				map.setView(target, zoom);
			} else {
				updateHash();
				loadFeatures();
			}
		}).catch(function (error) {
			if (serial !== addressSearchSerial) {
				return;
			}
			pendingAddress = null;
			addressStatus.textContent = 'Adresseopslag mislykkedes: ' + error.message;
		});
	}

	function parseYear(value) {
		if (value === null || value === undefined) {
			return null;
		}
		var text = String(value).trim();
		var year;
		if (/^\d{4}$/.test(text)) {
			year = Number(text);
		} else if (/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(text) && !isNaN(Date.parse(text))) {
			year = Number(text.slice(0, 4));
		} else {
			return null;
		}
		return Number.isInteger(year) && year >= 1000 && year <= CURRENT_YEAR ? year : null;
	}

	function featureId(feature) {
		var properties = feature.properties || {};
		var id = properties.id;
		if (id === null || id === undefined) {
			id = feature.id;
		}
		if (id === null || id === undefined) {
			id = properties.inspireId_localId;
		}
		if (id === null || id === undefined) {
			return 'xy:' + feature.geometry.coordinates.join(',');
		}
		return String(id);
	}

	function escapeHtml(value) {
		return String(value).replace(/[&<>"']/g, function (character) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
		});
	}

	function featureYear(feature) {
		return parseYear((feature.properties || {}).dateOfConstruction_dateOfEvent_anyPoint);
	}

	function totalFloors(feature) {
		var properties = feature.properties || {};
		return ['numberOfFloorsAboveGround', 'numberOfFloorsBelowGround'].reduce(function (total, field) {
			var count = Number(properties[field]);
			return total + (Number.isFinite(count) ? count : 0);
		}, 0);
	}

	function centuryColor(century) {
		var firstCentury = Math.floor(1000 / 100);
		var lastCentury = Math.floor(CURRENT_YEAR / 100);
		var progress = lastCentury === firstCentury ? 1 : (century - firstCentury) / (lastCentury - firstCentury);
		var stops = [0, 30, 60, 120, 180, 240];
		progress = Math.max(0, Math.min(1, progress));
		var position = progress * (stops.length - 1);
		var index = Math.min(Math.floor(position), stops.length - 2);
		var hue = stops[index] + (stops[index + 1] - stops[index]) * (position - index);
		return 'hsl(' + hue + ', 85%, 45%)';
	}

	function yearColor(year) {
		return centuryColor(Math.floor(year / 100));
	}

	function getPointFeatures() {
		return allFeatures.filter(function (feature) {
			var coordinates = feature.geometry && feature.geometry.coordinates;
			return coordinates && coordinates.length >= 2
				&& (featureYear(feature) !== null || showInvalid.checked);
		}).sort(function (a, b) {
			var yearA = featureYear(a), yearB = featureYear(b);
			if (yearA === null && yearB !== null) {
				return 1;
			}
			if (yearB === null && yearA !== null) {
				return -1;
			}
			var yearOrder = (yearA || 0) - (yearB || 0);
			if (yearOrder) {
				return yearOrder;
			}
			var idA = hashIdFor(a), idB = hashIdFor(b);
			return idA < idB ? -1 : idA > idB ? 1 : 0;
		});
	}

	function pointStepCount(features) {
		if (!features.length) {
			return 0;
		}
		return Math.min(features.length, Math.ceil(100 / POINTS_PER_STEP_PERCENT));
	}

	function pointCountForStep(step, total, steps) {
		return steps ? Math.round(total * step / steps) : 0;
	}

	function updatePointYearLabel(shown) {
		var latestVisibleYear = null;
		for (var visibleIndex = Math.min(shown, pointFeaturesCache.length) - 1; visibleIndex >= 0; visibleIndex--) {
			latestVisibleYear = featureYear(pointFeaturesCache[visibleIndex]);
			if (latestVisibleYear !== null) {
				break;
			}
		}
		yearValue.textContent = shown.toLocaleString('da-DK') + ' af '
			+ pointFeaturesCache.length.toLocaleString('da-DK') + ' punkter'
			+ (latestVisibleYear === null
				? shown ? ' · byggeår ukendt' : ''
				: ' · seneste byggeår ' + latestVisibleYear);
		slider.title = latestVisibleYear === null
			? shown ? 'De viste punkter har intet gyldigt byggeår' : 'Ingen punkter vist'
			: 'Seneste viste byggeår: ' + latestVisibleYear;
	}

	function pointStepForCount(count, total, steps) {
		var low = 0, high = steps;
		while (low < high) {
			var middle = Math.floor((low + high) / 2);
			if (pointCountForStep(middle, total, steps) >= count) {
				high = middle;
			} else {
				low = middle + 1;
			}
		}
		return steps ? low / steps * 100 : 0;
	}

	function setSliderGradient(gradient) {
		sliderGradientElement.style.background = gradient;
	}

	function pointSliderGradient(features, steps) {
		var centuries = [];
		var invalidCount = 0;
		features.forEach(function (feature) {
			var year = featureYear(feature);
			if (year === null) {
				invalidCount++;
				return;
			}
			var century = Math.floor(year / 100);
			var last = centuries[centuries.length - 1];
			if (last && last.century === century) {
				last.count++;
			} else {
				centuries.push({ century: century, count: 1 });
			}
		});
		if (!centuries.length) {
			return 'linear-gradient(to right, #777, #777)';
		}
		var stops = [centuryColor(centuries[0].century) + ' 0%'];
		var total = features.length;
		var cumulative = centuries[0].count;
		for (var i = 1; i < centuries.length; i++) {
			var position = pointStepForCount(cumulative + 1, total, steps);
			stops.push(centuryColor(centuries[i - 1].century) + ' ' + position + '%');
			stops.push(centuryColor(centuries[i].century) + ' ' + position + '%');
			cumulative += centuries[i].count;
		}
		var lastCentury = centuries[centuries.length - 1].century;
		if (invalidCount) {
			var invalidPosition = pointStepForCount(cumulative + 1, total, steps);
			stops.push(centuryColor(lastCentury) + ' ' + invalidPosition + '%');
			stops.push('#777 ' + invalidPosition + '%');
			stops.push('#777 100%');
		} else {
			stops.push(centuryColor(lastCentury) + ' 100%');
		}
		return 'linear-gradient(to right, ' + stops.join(', ') + ')';
	}

	function sliderGradient(minYear, maxYear) {
		if (minYear === maxYear) {
			var singleYearColor = yearColor(minYear);
			return 'linear-gradient(to right, ' + singleYearColor + ', ' + singleYearColor + ')';
		}
		var stops = [yearColor(minYear) + ' 0%'];
		for (var boundary = (Math.floor(minYear / 100) + 1) * 100; boundary <= maxYear; boundary += 100) {
			var position = ((boundary - minYear) / (maxYear - minYear)) * 100;
			stops.push(yearColor(boundary - 1) + ' ' + position + '%');
			stops.push(yearColor(boundary) + ' ' + position + '%');
		}
		stops.push(yearColor(maxYear) + ' 100%');
		return 'linear-gradient(to right, ' + stops.join(', ') + ')';
	}

	function drawYearHistogram() {
		var validYears = allFeatures.map(featureYear).filter(function (year) {
			return year !== null;
		});
		var width = yearHistogram.clientWidth;
		if (!validYears.length || !width) {
			return;
		}
		var height = 10;
		var minYear = Math.min.apply(null, validYears);
		var maxYear = Math.max.apply(null, validYears);
		var pixelRatio = window.devicePixelRatio || 1;
		yearHistogram.width = Math.round(width * pixelRatio);
		yearHistogram.height = Math.round(height * pixelRatio);
		var context = yearHistogram.getContext('2d');
		if (!context) {
			throw new Error('Browseren kunne ikke tegne histogrammet.');
		}
		context.setTransform(yearHistogram.width / width, 0, 0, yearHistogram.height / height, 0, 0);
		var countsByYear = new Map();
		allFeatures.forEach(function (feature) {
			var year = featureYear(feature);
			if (year === null) {
				return;
			}
			countsByYear.set(year, (countsByYear.get(year) || 0) + 1);
		});
		var maxCount = 0;
		countsByYear.forEach(function (count) {
			maxCount = Math.max(maxCount, count);
		});
		if (!maxCount) {
			return;
		}
		context.fillStyle = '#555';
		countsByYear.forEach(function (count, year) {
			if (!count) {
				return;
			}
			var ratio;
			if (YEAR_HISTOGRAM_SCALE === 'linear') {
				ratio = count / maxCount;
			} else if (YEAR_HISTOGRAM_SCALE === 'logarithmic') {
				ratio = Math.log1p(count) / Math.log1p(maxCount);
			} else {
				throw new Error('Ukendt YEAR_HISTOGRAM_SCALE: ' + YEAR_HISTOGRAM_SCALE);
			}
			var barHeight = Math.max(1, Math.ceil(ratio * height));
			var start = maxYear === minYear ? 0 : (year - minYear) / (maxYear - minYear) * width;
			var end = maxYear === minYear ? width : (year + 1 - minYear) / (maxYear - minYear) * width;
			var x = Math.floor(start);
			var barWidth = Math.max(1, Math.ceil(Math.min(width, end)) - x);
			context.fillRect(x, height - barHeight, barWidth, barHeight);
		});
	}

	function updateSliderColor() {
		if (animationMode === 'points') {
			var displayedCount = pointCountForStep(selectedPointStep, pointFeaturesCache.length, pointStepCount(pointFeaturesCache));
			var currentFeature = pointFeaturesCache[displayedCount - 1];
			var currentYear = currentFeature ? featureYear(currentFeature) : null;
			if (currentYear === null && !currentFeature) {
				currentYear = pointFeaturesCache.length ? featureYear(pointFeaturesCache[0]) : null;
			}
			slider.style.setProperty('--year-color', currentYear === null ? '#777' : yearColor(currentYear));
			return;
		}
		var colorYear = selectedYear;
		slider.style.setProperty('--year-color', yearColor(colorYear || Number(slider.value)));
	}

	function syncTimelineButtons() {
		var disabled = slider.disabled;
		var year = Number(slider.value);
		var min = Number(slider.min);
		var max = Number(slider.max);
		yearStartButton.disabled = disabled || year <= min;
		yearBackButton.disabled = disabled || year <= min;
		yearForwardButton.disabled = disabled || year >= max;
		yearEndButton.disabled = disabled || year >= max;
		yearPlayButton.disabled = disabled || min === max;
		yearSpeed.disabled = disabled;
		animationModeSelect.disabled = disabled && pointFeaturesCache.length === 0;
		yearSpeed.querySelector('option[value="fast"]').textContent = 'Hurtig';
		yearSpeed.setAttribute('aria-label', animationMode === 'year'
			? 'Hastighed (hurtig svarer til 50 år per sekund)'
			: 'Hastighed (hurtig svarer til 50 trin per sekund)');
		yearBackButton.textContent = animationMode === 'year' ? '−1 år' : '−1 trin';
		yearForwardButton.textContent = animationMode === 'year' ? '+1 år' : '+1 trin';
		yearStartButton.title = animationMode === 'year' ? 'Gå til første år' : 'Vis ingen punkter';
		yearStartButton.setAttribute('aria-label', yearStartButton.title);
		yearBackButton.title = animationMode === 'year' ? 'Gå ét år tilbage' : 'Gå ét trin tilbage';
		yearBackButton.setAttribute('aria-label', yearBackButton.title);
		yearForwardButton.title = animationMode === 'year' ? 'Gå ét år frem' : 'Gå ét trin frem';
		yearForwardButton.setAttribute('aria-label', yearForwardButton.title);
		yearEndButton.title = animationMode === 'year' ? 'Gå til sidste år' : 'Vis alle punkter';
		yearEndButton.setAttribute('aria-label', yearEndButton.title);
	}

	function currentTimelineRange() {
		return {
			min: Number(slider.min),
			max: Number(slider.max),
			value: Number(slider.value)
		};
	}

	function setTimelineValue(value) {
		if (slider.disabled) {
			return;
		}
		var range = currentTimelineRange();
		value = Math.max(range.min, Math.min(range.max, Math.round(value)));
		slider.value = String(value);
		if (animationMode === 'year') {
			selectedYear = value;
			yearValue.textContent = String(value);
			timelineLabel.textContent = 'Byggeår til og med år';
			slider.title = 'Byggeår til og med ' + value;
		} else {
			selectedPointStep = value;
			var count = pointCountForStep(value, pointFeaturesCache.length, range.max);
			updatePointYearLabel(count);
			timelineLabel.textContent = 'Viste punkter';
		}
		updateSliderColor();
		renderFeatures();
		syncTimelineButtons();
	}

	function stopAnimation() {
		if (animationTimer !== null) {
			clearInterval(animationTimer);
			animationTimer = null;
		}
		yearPlayButton.textContent = '▶ Afspil';
		yearPlayButton.setAttribute('aria-label', 'Afspil tidslinjen');
		yearPlayButton.setAttribute('aria-pressed', 'false');
	}

	function startAnimation() {
		if (slider.disabled || Number(slider.min) === Number(slider.max)) {
			return;
		}
		if (Number(slider.value) >= Number(slider.max)) {
			setTimelineValue(Number(slider.min));
		}
		yearPlayButton.textContent = 'Ⅱ Pause';
		yearPlayButton.setAttribute('aria-label', 'Sæt tidslinjen på pause');
		yearPlayButton.setAttribute('aria-pressed', 'true');
		beginAnimationClock();
	}

	function beginAnimationClock() {
		animationStartValue = Number(slider.value);
		animationStartTime = performance.now();
		animationTimer = setInterval(advanceAnimation, YEAR_ANIMATION_INTERVALS[yearSpeed.value]);
	}

	function advanceAnimation() {
		var interval = YEAR_ANIMATION_INTERVALS[yearSpeed.value];
		var elapsedYears = Math.floor((performance.now() - animationStartTime) / interval);
		var nextValue = animationStartValue + elapsedYears;
		if (nextValue <= Number(slider.value)) {
			return;
		}
		if (nextValue >= Number(slider.max)) {
			setTimelineValue(Number(slider.max));
			stopAnimation();
			return;
		}
		setTimelineValue(nextValue);
	}

	function updateAnimationSpeed() {
		if (animationTimer !== null) {
			clearInterval(animationTimer);
			beginAnimationClock();
		}
	}

	function selectedFromHash() {
		var params = new URLSearchParams(location.hash.slice(1));
		var id = params.get('id');
		return id === null ? null : id;
	}

	function updateHash() {
		var center = map.getCenter();
		var fragment = 'map=' + map.getZoom() + '/' + center.lat.toFixed(6) + '/' + center.lng.toFixed(6);
		if (selectedId !== null) {
			fragment += '&id=' + encodeURIComponent(selectedId);
		}
		history.replaceState(null, '', '#' + fragment);
	}

	function readInitialView() {
		var params = new URLSearchParams(location.hash.slice(1));
		var value = params.get('map');
		var match = value && /^(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(value);
		selectedId = selectedFromHash();
		if (!match) {
			return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM_LEVEL };
		}
		return {
			center: [Number(match[2]), Number(match[3])],
			zoom: Math.max(0, Math.min(OSM_MAX_ZOOM_LEVEL, Number(match[1])))
		};
	}

	function hashIdFor(feature) {
		return featureId(feature);
	}

	function shareUrl(id) {
		var center = map.getCenter();
		var fragment = 'map=' + map.getZoom() + '/' + center.lat.toFixed(6) + '/' + center.lng.toFixed(6)
			+ '&id=' + encodeURIComponent(id);
		return location.origin + location.pathname + location.search + '#' + fragment;
	}

	function legacyCopyText(text) {
		var textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		var copied = false;
		try {
			copied = document.execCommand('copy');
		} finally {
			textarea.remove();
		}
		if (!copied) {
			throw new Error('Clipboard access was denied');
		}
	}

	function copyTextToClipboard(text) {
		if (!navigator.clipboard || !navigator.clipboard.writeText) {
			try {
				legacyCopyText(text);
				return Promise.resolve();
			} catch (error) {
				return Promise.reject(error);
			}
		}
		var writePromise;
		try {
			writePromise = navigator.clipboard.writeText(text);
		} catch (error) {
			try {
				legacyCopyText(text);
				return Promise.resolve();
			} catch (fallbackError) {
				return Promise.reject(fallbackError);
			}
		}
		return Promise.resolve(writePromise).catch(function () {
			legacyCopyText(text);
		});
	}

	function setupShareLink(popupElement) {
		var link = popupElement && popupElement.querySelector('.building-share-link');
		var status = popupElement && popupElement.querySelector('.building-share-status');
		if (!link || !status || link.dataset.copyBound === 'true') {
			return;
		}
		link.dataset.copyBound = 'true';
		var feedbackTimer = null;
		link.addEventListener('click', function (event) {
			event.preventDefault();
			if (feedbackTimer) {
				clearTimeout(feedbackTimer);
			}
			status.textContent = '';
			link.classList.remove('copied');
			copyTextToClipboard(link.href).then(function () {
				status.textContent = 'Kopieret';
				link.classList.add('copied');
				feedbackTimer = setTimeout(function () {
					status.textContent = '';
					link.classList.remove('copied');
					feedbackTimer = null;
				}, 1500);
			}).catch(function () {
				status.textContent = 'Kunne ikke kopiere. Prøv igen eller kopiér linkadressen manuelt.';
			});
		});
	}

	function obliqueUrl(latlng, orientation) {
		var xy = latLngToUtm32(latlng.lat, latlng.lng);
		var url = 'https://skraafoto.dataforsyningen.dk/?center='
			+ Math.round(xy[0]) + '%2C' + Math.round(xy[1]);
		if (['north', 'east', 'south', 'west'].indexOf(orientation) !== -1) {
			url += '&orientation=' + encodeURIComponent(orientation);
		}
		return url;
	}

	function projectToObliquePixel(item, x, y) {
		var properties = item.properties || {};
		var orientation = properties['pers:interior_orientation'];
		var rotation = properties['pers:rotation_matrix'];
		var center = properties['pers:perspective_center'];
		var shape = properties['proj:shape'];
		if (!orientation || !rotation || !center || !shape || rotation.length !== 9
			|| (Number(properties['pers:crs']) !== 25832)) {
			return null;
		}
		var dimensions = orientation.sensor_array_dimensions;
		var spacing = orientation.pixel_spacing;
		var principalPoint = orientation.principal_point_offset || [0, 0];
		if (!dimensions || !spacing || dimensions.length < 2 || spacing.length < 2) {
			return null;
		}
		var width = Number(shape[1]);
		var height = Number(shape[0]);
		var pixelSizeX = Number(spacing[0]);
		var pixelSizeY = Number(spacing[1]);
		var focalLength = Number(orientation.focal_length);
		var values = [width, height, pixelSizeX, pixelSizeY, focalLength].concat(rotation, center);
		if (!values.every(Number.isFinite) || width <= 0 || height <= 0
			|| pixelSizeX <= 0 || pixelSizeY <= 0 || focalLength <= 0) {
			return null;
		}

		var dx = x - center[0];
		var dy = y - center[1];
		var dz = OBLIQUE_GROUND_ELEVATION - center[2];
		var denominator = rotation[6] * dx + rotation[7] * dy + rotation[8] * dz;
		if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) {
			return null;
		}
		var focalPixels = focalLength / pixelSizeX;
		var principalX = Number(dimensions[0]) / 2 + Number(principalPoint[0] || 0) / pixelSizeX;
		var principalY = Number(dimensions[1]) / 2 + Number(principalPoint[1] || 0) / pixelSizeY;
		var lowerLeftX = principalX - focalPixels
			* (rotation[0] * dx + rotation[1] * dy + rotation[2] * dz) / denominator;
		var lowerLeftY = principalY - focalPixels
			* (rotation[3] * dx + rotation[4] * dy + rotation[5] * dz) / denominator;
		var pixelX = lowerLeftX;
		var pixelY = height - lowerLeftY;
		if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)
			|| pixelX < 0 || pixelY < 0 || pixelX >= width || pixelY >= height) {
			return null;
		}
		return {
			x: pixelX,
			y: pixelY,
			width: width,
			height: height
		};
	}

	function obliqueDirectionLabel(direction) {
		var labels = {
			north: 'mod nord',
			east: 'mod øst',
			south: 'mod syd',
			west: 'mod vest',
			unknown: 'ukendt'
		};
		return labels[direction] || direction;
	}

	function findObliqueItems(latlng, coordinates) {
		var point = {
			type: 'Point',
			coordinates: [latlng.lng, latlng.lat]
		};
		var params = new URLSearchParams({
			filter: JSON.stringify({
				contains: [{ property: 'geometry' }, point]
			}),
			'filter-lang': 'cql-json',
			'filter-crs': 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
			crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
			limit: '10'
		});
		return fetchJson(OBLIQUE_API_URL + '?' + params.toString(), {
			headers: {
				token: DATAFORSYNINGEN_TOKEN,
				Accept: 'application/geo+json'
			}
		}).then(function (data) {
			return (data.features || []).map(function (item) {
				var properties = item.properties || {};
				var pixel = projectToObliquePixel(item, coordinates[0], coordinates[1]);
				var direction = String(properties.direction || '').toLowerCase();
				if (!pixel || direction === 'nadir') {
					return null;
				}
				var centerX = pixel.width / 2;
				var centerY = pixel.height / 2;
				var distanceFromCenter = Math.pow((pixel.x - centerX) / pixel.width, 2)
					+ Math.pow((pixel.y - centerY) / pixel.height, 2);
				return {
					item: item,
					pixel: pixel,
					direction: direction || 'unknown',
					distanceFromCenter: distanceFromCenter,
					datetime: String(properties.datetime || ''),
					previewPromise: null,
					previewUrl: null
				};
			}).filter(Boolean).sort(function (a, b) {
				return b.datetime.localeCompare(a.datetime)
					|| a.distanceFromCenter - b.distanceFromCenter;
			}).reduce(function (directions, candidate) {
				if (!directions.some(function (current) {
					return current.direction === candidate.direction;
				})) {
					directions.push(candidate);
				}
				return directions;
			}, []).sort(function (a, b) {
				var order = ['north', 'east', 'south', 'west'];
				var indexA = order.indexOf(a.direction);
				var indexB = order.indexOf(b.direction);
				return (indexA < 0 ? order.length : indexA) - (indexB < 0 ? order.length : indexB);
			});
		});
	}

	function loadGeoTiffLibrary() {
		if (window.GeoTIFF) {
			return Promise.resolve(window.GeoTIFF);
		}
		if (!geoTiffLibraryPromise) {
			geoTiffLibraryPromise = new Promise(function (resolve, reject) {
				var script = document.createElement('script');
				script.src = GEOTIFF_SCRIPT_URL;
				script.async = true;
				script.crossOrigin = 'anonymous';
				script.onload = function () {
					if (window.GeoTIFF) {
						resolve(window.GeoTIFF);
					} else {
						geoTiffLibraryPromise = null;
						reject(new Error('GeoTIFF-biblioteket kunne ikke indlæses'));
					}
				};
				script.onerror = function () {
					geoTiffLibraryPromise = null;
					reject(new Error('GeoTIFF-biblioteket kunne ikke hentes'));
				};
				document.head.appendChild(script);
			});
		}
		return geoTiffLibraryPromise;
	}

	function obliqueAssetUrl(item) {
		var asset = item.assets && item.assets.data;
		if (!asset || !asset.href) {
			throw new Error('Skråfotoet har ingen billedfil');
		}
		var url = new URL(asset.href);
		if (!/(^|\.)dataforsyningen\.dk$/i.test(url.hostname)) {
			throw new Error('Billedfilen kommer fra en ukendt tjeneste');
		}
		url.searchParams.set('token', DATAFORSYNINGEN_TOKEN);
		return url.href;
	}

	function drawObliqueCrop(image, pixel) {
		var cropWidth = Math.min(OBLIQUE_CROP_SIZE, image.getWidth());
		var cropHeight = Math.min(OBLIQUE_CROP_SIZE, image.getHeight());
		var left = Math.max(0, Math.min(image.getWidth() - cropWidth,
			Math.round(pixel.x - cropWidth / 2)));
		var top = Math.max(0, Math.min(image.getHeight() - cropHeight,
			Math.round(pixel.y - cropHeight / 2)));
		var right = left + cropWidth;
		var bottom = top + cropHeight;
		return image.readRGB({
			window: [left, top, right, bottom],
			interleave: true
		}).then(function (rgb) {
			var canvas = document.createElement('canvas');
			canvas.width = cropWidth;
			canvas.height = cropHeight;
			var context = canvas.getContext('2d');
			var rgba = new Uint8ClampedArray(cropWidth * cropHeight * 4);
			for (var sourceOffset = 0, targetOffset = 0; sourceOffset < rgb.length;
				sourceOffset += 3, targetOffset += 4) {
				rgba[targetOffset] = rgb[sourceOffset];
				rgba[targetOffset + 1] = rgb[sourceOffset + 1];
				rgba[targetOffset + 2] = rgb[sourceOffset + 2];
				rgba[targetOffset + 3] = 255;
			}
			context.putImageData(new ImageData(rgba, cropWidth, cropHeight), 0, 0);
			return canvas.toDataURL('image/jpeg', 0.82);
		});
	}

	function loadObliqueCandidate(candidate, GeoTIFF) {
		if (candidate.previewUrl) {
			return Promise.resolve(candidate.previewUrl);
		}
		if (!candidate.previewPromise) {
			candidate.previewPromise = GeoTIFF.fromUrl(obliqueAssetUrl(candidate.item)).then(function (tiff) {
				return tiff.getImage();
			}).then(function (image) {
				return drawObliqueCrop(image, candidate.pixel);
			}).then(function (previewUrl) {
				candidate.previewUrl = previewUrl;
				return previewUrl;
			}).catch(function (error) {
				candidate.previewPromise = null;
				throw error;
			});
		}
		return candidate.previewPromise;
	}

	function displayObliqueCandidates(state, container, GeoTIFF, latlng) {
		var candidates = state.candidates;
		var status = container.querySelector('.building-oblique-status');
		var caption = container.querySelector('.building-oblique-caption');
		var stage = container.querySelector('.building-oblique-stage');
		var image = document.createElement('img');
		var imageLink = document.createElement('a');
		var previousButton = document.createElement('button');
		var nextButton = document.createElement('button');
		var selectedIndex = candidates.findIndex(function (candidate) {
			return candidate.direction === state.selectedDirection;
		});
		if (selectedIndex < 0) {
			selectedIndex = Math.max(0, candidates.findIndex(function (candidate) {
				return candidate.direction === 'north';
			}));
		}
		var renderSerial = 0;
		image.alt = 'Skråfoto-udsnit';
		imageLink.className = 'building-oblique-image-link';
		imageLink.target = '_blank';
		imageLink.rel = 'noopener noreferrer';
		imageLink.appendChild(image);
		previousButton.type = 'button';
		previousButton.className = 'building-oblique-arrow building-oblique-previous';
		previousButton.textContent = '↻';
		previousButton.setAttribute('aria-label', 'Vis skråfoto fra forrige retning');
		nextButton.type = 'button';
		nextButton.className = 'building-oblique-arrow building-oblique-next';
		nextButton.textContent = '↺';
		nextButton.setAttribute('aria-label', 'Vis skråfoto fra næste retning');
		previousButton.hidden = candidates.length < 2;
		nextButton.hidden = candidates.length < 2;
		stage.replaceChildren(imageLink, status, previousButton, nextButton);
		L.DomEvent.disableClickPropagation(stage);

		function showCandidate(index) {
			selectedIndex = (index + candidates.length) % candidates.length;
			var candidate = candidates[selectedIndex];
			var properties = candidate.item.properties || {};
			var year = String(properties.datetime || '').slice(0, 4) || 'ukendt år';
			var direction = obliqueDirectionLabel(candidate.direction);
			var imageAlt = 'Skråfoto-udsnit ' + direction;
			var captionText = 'Skråfoto © Klimadatastyrelsen, ' + year + ' (' + direction + ')';
			var serial = ++renderSerial;
			state.selectedDirection = candidate.direction;
			previousButton.title = 'Vis skråfoto ' + obliqueDirectionLabel(
				candidates[(selectedIndex - 1 + candidates.length) % candidates.length].direction);
			nextButton.title = 'Vis skråfoto ' + obliqueDirectionLabel(
				candidates[(selectedIndex + 1) % candidates.length].direction);
			status.textContent = candidate.previewUrl ? '' : 'Henter foto ' + direction + ' …';
			loadObliqueCandidate(candidate, GeoTIFF).then(function (previewUrl) {
				if (serial === renderSerial && container.isConnected) {
					image.alt = imageAlt;
					caption.textContent = captionText;
					image.src = previewUrl;
					imageLink.href = obliqueUrl(latlng, candidate.direction);
					imageLink.title = 'Åbn skråfoto ' + direction + ' i en ny fane';
					imageLink.setAttribute('aria-label', imageLink.title);
					status.textContent = '';
					container.dataset.loaded = 'true';
					container.dataset.loading = '';
				}
			}).catch(function (error) {
				if (serial === renderSerial && container.isConnected) {
					status.textContent = 'Skråfoto kunne ikke indlæses: ' + error.message;
					container.dataset.loading = '';
				}
			});
		}

		previousButton.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			showCandidate(selectedIndex - 1);
		});
		nextButton.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			showCandidate(selectedIndex + 1);
		});
		showCandidate(selectedIndex);
	}

	function loadObliquePreview(id, latlng, coordinates, popupElement) {
		var container = popupElement && popupElement.querySelector('.building-oblique-preview');
		if (!container || container.dataset.loading === 'true' || container.dataset.loaded === 'true') {
			return;
		}
		container.dataset.loading = 'true';
		var status = container.querySelector('.building-oblique-status');
		if (!DATAFORSYNINGEN_TOKEN) {
			status.textContent = 'Skråfoto kræver et Dataforsyningen-token i www/config.js.';
			container.dataset.loaded = 'true';
			return;
		}
		if (!activeObliquePreview || activeObliquePreview.id !== id) {
			activeObliquePreview = {
				id: id,
				candidates: null,
				searchPromise: null,
				selectedDirection: 'north'
			};
		}
		var state = activeObliquePreview;
		if (state.candidates) {
			if (!state.candidates.length) {
				status.textContent = 'Intet passende skråfoto fundet for dette punkt.';
				container.dataset.loaded = 'true';
				return;
			}
			loadGeoTiffLibrary().then(function (GeoTIFF) {
				if (container.isConnected) {
					displayObliqueCandidates(state, container, GeoTIFF, latlng);
				}
			}).catch(function (error) {
				if (container.isConnected) {
					status.textContent = 'Skråfoto kunne ikke indlæses: ' + error.message;
					container.dataset.loading = '';
				}
			});
			return;
		}
		if (!state.searchPromise) {
			status.textContent = 'Finder skråfotos …';
			state.searchPromise = findObliqueItems(latlng, coordinates).then(function (candidates) {
				state.candidates = candidates;
				return candidates;
			}).catch(function (error) {
				state.searchPromise = null;
				throw error;
			});
		}
		state.searchPromise.then(function (candidates) {
			if (!container.isConnected) {
				return;
			}
			if (!candidates.length) {
				status.textContent = 'Intet passende skråfoto fundet for dette punkt.';
				container.dataset.loaded = 'true';
				return;
			}
			return loadGeoTiffLibrary().then(function (GeoTIFF) {
				if (!container.isConnected) {
					return;
				}
				displayObliqueCandidates(state, container, GeoTIFF, latlng);
			});
		}).catch(function (error) {
			if (container.isConnected) {
				status.textContent = 'Skråfoto kunne ikke indlæses: ' + error.message;
				container.dataset.loading = '';
			}
		});
	}

	function popupContent(feature, latlng, id) {
		var properties = feature.properties || {};
		var fields = [
			['Adresse', 'addressRepresentation'],
			['Brug', 'currentUse'],
			['Loftmateriale', 'materialOfRoof'],
			['Varmekilde', 'heatingSource'],
			['Varmesystem', 'heatingSystem'],
			['Etager over terræn', 'numberOfFloorsAboveGround'],
			['Etager under terræn', 'numberOfFloorsBelowGround'],
			['Navn', 'name'],
			['Tagtype', 'roofType']
		];
		var rows = fields.filter(function (field) {
			var value = properties[field[1]];
			return value !== null && value !== undefined && String(value).trim() !== '';
		}).map(function (field) {
			var value = escapeHtml(properties[field[1]]);
			if (field[1] === 'addressRepresentation') {
				value = value.replace(/,\s*/g, ',<br>');
			}
			return '<dt>' + escapeHtml(field[0]) + '</dt><dd>' + value + '</dd>';
		}).join('');
		var year = featureYear(feature);
		if (year === null) {
			rows += '<dt>Byggeår</dt><dd>Ugyldigt eller ukendt</dd>';
		} else {
			rows += '<dt>Byggeår</dt><dd>' + year + '</dd>';
		}
		var oblique = '<a href="' + escapeHtml(obliqueUrl(latlng)) + '" target="_blank" rel="noopener">Se skråfoto</a>';
		var share = '<a class="building-share-link" href="' + escapeHtml(shareUrl(id)) + '">Del link til dette punkt</a>'
			+ '<span class="building-share-status" role="status" aria-live="polite"></span>';
		return '<div class="building-popup">'
			+ '<div class="building-oblique-preview">'
			+ '<div class="building-oblique-stage"><span class="building-oblique-status" role="status" aria-live="polite">Indlæser skråfoto …</span></div>'
			+ '<small class="building-oblique-caption"></small></div>'
			+ '<dl>' + rows + '</dl>'
			+ '<div class="building-popup-actions">' + share + ' · ' + oblique + '</div></div>';
	}

	function updateYearControl() {
		var validYears = allFeatures.map(featureYear).filter(function (year) {
			return year !== null;
		});
		var min = validYears.length ? Math.min.apply(null, validYears) : null;
		var max = validYears.length ? Math.max.apply(null, validYears) : null;
		pointFeaturesCache = getPointFeatures();
		if (animationMode === 'points') {
			yearHistogram.hidden = true;
			var steps = pointStepCount(pointFeaturesCache);
			slider.disabled = steps === 0;
			slider.min = '0';
			slider.max = String(steps);
			if (selectedPointStep === null) {
				selectedPointStep = steps;
			} else {
				selectedPointStep = Math.max(0, Math.min(steps, selectedPointStep));
			}
			slider.value = String(selectedPointStep);
			timelineLabel.textContent = 'Viste punkter';
			setSliderGradient(pointSliderGradient(pointFeaturesCache, steps));
			var shown = pointCountForStep(selectedPointStep, pointFeaturesCache.length, steps);
			updatePointYearLabel(shown);
			document.getElementById('year-min').textContent = '0 punkter';
			document.getElementById('year-max').textContent = pointFeaturesCache.length.toLocaleString('da-DK') + ' punkter';
			updateSliderColor();
		} else if (min === null) {
			yearHistogram.hidden = true;
			stopAnimation();
			slider.disabled = true;
			slider.min = '1000';
			slider.max = '1000';
			slider.value = '1000';
			timelineLabel.textContent = 'Byggeår til og med år';
			slider.title = 'Ingen gyldige byggeår';
			setSliderGradient('linear-gradient(to right, #aaa, #aaa)');
			slider.style.setProperty('--year-color', '#aaa');
			yearValue.textContent = '—';
			document.getElementById('year-min').textContent = '—';
			document.getElementById('year-max').textContent = '—';
		} else {
			yearHistogram.hidden = false;
			drawYearHistogram();
			slider.disabled = false;
			slider.min = String(min);
			slider.max = String(max);
			if (selectedYear === null) {
				selectedYear = max;
			} else {
				selectedYear = Math.max(min, Math.min(max, selectedYear));
			}
			slider.value = String(selectedYear);
			timelineLabel.textContent = 'Byggeår til og med år';
			slider.title = 'Byggeår til og med ' + selectedYear;
			setSliderGradient(sliderGradient(min, max));
			updateSliderColor();
			yearValue.textContent = String(selectedYear);
			document.getElementById('year-min').textContent = String(min);
			document.getElementById('year-max').textContent = String(max);
		}
		syncTimelineButtons();
	}

	function renderFeatures() {
		renderingFeatures = true;
		buildingLayer.clearLayers();
		var visibleIds = new Set();
		var visibleCount = 0;
		var visibleFeatures;
		if (animationMode === 'points') {
			var frameCount = pointStepCount(pointFeaturesCache);
			var count = pointCountForStep(selectedPointStep || 0, pointFeaturesCache.length, frameCount);
			visibleFeatures = pointFeaturesCache.slice(0, count);
		} else {
			visibleFeatures = allFeatures.filter(function (feature) {
				var year = featureYear(feature);
				return year === null ? showInvalid.checked : year <= selectedYear;
			});
		}
		visibleFeatures.forEach(function (feature) {
			var year = featureYear(feature);
			var invalid = year === null;
			var coordinates = feature.geometry && feature.geometry.coordinates;
			if (!coordinates || coordinates.length < 2) {
				return;
			}
			var latlng = utm32ToLatLng(coordinates[0], coordinates[1]);
			var id = hashIdFor(feature);
			visibleIds.add(id);
			var color = invalid ? '#777' : yearColor(year);
			var marker = L.circleMarker(latlng, {
				renderer: canvasRenderer,
				radius: 4,
				color: invalid ? '#666' : color,
				weight: 1,
				fillColor: invalid ? '#aaa' : color,
				fillOpacity: 0.8
			});
			var popupLatLng = L.latLng(latlng[0], latlng[1]);
			marker.bindPopup(popupContent(feature, popupLatLng, id), { maxWidth: 380 });
			marker.on('popupopen', function (event) {
				var popupElement = event.popup.getElement();
				setupShareLink(popupElement);
				loadObliquePreview(id, popupLatLng, coordinates, popupElement);
			});
			marker.on('click', function () {
				selectedId = id;
				updateHash();
			});
			marker.on('popupclose', function () {
				if (!renderingFeatures && selectedId === id) {
					selectedId = null;
					if (activeObliquePreview && activeObliquePreview.id === id) {
						activeObliquePreview = null;
					}
					updateHash();
				}
			});
			marker.addTo(buildingLayer);
			if (selectedId === id) {
				marker.openPopup();
			}
			visibleCount++;
		});
		renderingFeatures = false;
		if (selectedId !== null && !visibleIds.has(selectedId)) {
			selectedId = null;
			updateHash();
		}
		status.textContent = animationMode === 'points'
			? visibleCount.toLocaleString('da-DK') + ' af ' + pointFeaturesCache.length.toLocaleString('da-DK') + ' punkter vist.'
			: visibleCount.toLocaleString('da-DK') + ' ud af ' + pointFeaturesCache.length.toLocaleString('da-DK')
				+ ' bygninger vist i kortudsnittet.';
	}

	function setDataControlsVisible(visible) {
		[yearHeading, yearHistogram, yearSliderWrap, yearRange, timelineToolbar, exportControls].forEach(function (element) {
			element.hidden = !visible;
		});
	}

	function activateAddressMatch(feature) {
		animationMode = 'year';
		animationModeSelect.value = animationMode;
		var year = featureYear(feature);
		if (year === null) {
			showInvalid.checked = true;
		} else if (year > selectedYear) {
			selectedYear = year;
		}
		updateYearControl();
		selectedId = hashIdFor(feature);
		renderFeatures();
		updateHash();
	}

	function boundsInUtm() {
		var bounds = map.getBounds();
		var corners = [
			bounds.getNorthWest(), bounds.getNorthEast(),
			bounds.getSouthWest(), bounds.getSouthEast()
		].map(function (latlng) {
			return latLngToUtm32(latlng.lat, latlng.lng);
		});
		var xs = corners.map(function (point) { return point[0]; });
		var ys = corners.map(function (point) { return point[1]; });
		return {
			minX: Math.min.apply(null, xs),
			minY: Math.min.apply(null, ys),
			maxX: Math.max.apply(null, xs),
			maxY: Math.max.apply(null, ys)
		};
	}

	async function loadFeatures() {
		var serial = ++requestSerial;
		if (map.getZoom() < MIN_ZOOM_LEVEL) {
			var previousPointStep = selectedPointStep;
			stopAnimation();
			if (selectedId !== null) {
				selectedId = null;
				updateHash();
			}
			allFeatures = [];
			pointFeaturesCache = [];
			buildingLayer.clearLayers();
			updateYearControl();
			selectedPointStep = previousPointStep;
			setDataControlsVisible(false);
			status.textContent = 'Zoom længere ind for at se punkter og bruge tidslinjen.';
			return;
		}
		setDataControlsVisible(true);
		status.textContent = 'Henter bygninger i kortudsnittet …';
		try {
			var features = [];
			for await (var feature of flatgeobuf.deserialize(BBR_DATA_URL, { rect: boundsInUtm() })) {
				features.push(feature);
			}
			if (serial !== requestSerial) {
				return;
			}
			allFeatures = features;
			if (selectedId !== null && allFeatures.some(function (feature) {
				return hashIdFor(feature) === selectedId && featureYear(feature) === null;
			})) {
				showInvalid.checked = true;
			}
			updateYearControl();
			if (pendingAddress) {
				var requestedAddress = pendingAddress;
				pendingAddress = null;
				var matches = allFeatures.filter(function (feature) {
					return normalizeAddress((feature.properties || {}).addressRepresentation) === requestedAddress.normalized;
				});
				var match = matches.reduce(function (oldest, candidate) {
					if (!oldest) {
						return candidate;
					}
					var oldestYear = featureYear(oldest);
					var candidateYear = featureYear(candidate);
					if (candidateYear !== null && (oldestYear === null || candidateYear < oldestYear)) {
						return candidate;
					}
					if (candidateYear !== null && candidateYear === oldestYear
						&& totalFloors(candidate) > totalFloors(oldest)) {
						return candidate;
					}
					return oldest;
				}, null);
				if (match) {
					addressStatus.textContent = 'Adresse fundet i BBR: ' + requestedAddress.title;
					activateAddressMatch(match);
				} else {
					renderFeatures();
					addressStatus.textContent = 'Ingen bygning med samme adresse fundet i kortudsnittet.';
				}
			} else {
				renderFeatures();
			}
		} catch (error) {
			if (serial === requestSerial) {
				if (pendingAddress) {
					pendingAddress = null;
					addressStatus.textContent = 'Kunne ikke søge i BBR-data for adressen.';
				}
				status.textContent = 'Kunne ikke hente kortdata: ' + error.message;
			}
		}
	}

	function checkExportCancellation() {
		if (exportCancelRequested) {
			var error = new Error('Videoeksporten blev afbrudt.');
			error.name = 'AbortError';
			throw error;
		}
	}

	function waitForBaseTiles() {
		return new Promise(function (resolve) {
			if (exportCancelRequested || !activeBaseLayer || !activeBaseLayer.isLoading()) {
				resolve();
				return;
			}
			var layer = activeBaseLayer;
			var finished = false;
			var timeout = setTimeout(finish, 15000);
			var cancellationPoll = setInterval(function () {
				if (exportCancelRequested) {
					finish();
				}
			}, 100);
			function finish() {
				if (finished) {
					return;
				}
				finished = true;
				clearTimeout(timeout);
				clearInterval(cancellationPoll);
				layer.off('load', finish);
				resolve();
			}
			layer.once('load', finish);
		});
	}

	async function getTileDrawData() {
		await waitForBaseTiles();
		checkExportCancellation();
		await new Promise(function (resolve) {
			requestAnimationFrame(function () {
				requestAnimationFrame(resolve);
			});
		});
		checkExportCancellation();
		var mapRect = map.getContainer().getBoundingClientRect();
		var tileContainer = activeBaseLayer && activeBaseLayer.getContainer();
		if (!tileContainer) {
			throw new Error('Kortlaget er ikke klar til eksport.');
		}
		var tiles = Array.from(tileContainer.querySelectorAll('img.leaflet-tile-loaded'))
			.filter(function (image) {
				var rect = image.getBoundingClientRect();
				var style = getComputedStyle(image);
				return image.complete && image.naturalWidth > 0 && style.display !== 'none'
					&& style.visibility !== 'hidden' && Number(style.opacity) > 0
					&& rect.right > mapRect.left && rect.left < mapRect.right
					&& rect.bottom > mapRect.top && rect.top < mapRect.bottom;
			})
			.map(function (image) {
				var rect = image.getBoundingClientRect();
				return {
					image: image,
					x: rect.left - mapRect.left,
					y: rect.top - mapRect.top,
					width: rect.width,
					height: rect.height,
					opacity: Number(getComputedStyle(image).opacity)
				};
			});
		if (!tiles.length) {
			throw new Error('Kortfliserne er ikke indlæst endnu. Prøv igen om et øjeblik.');
		}
		return tiles;
	}

	function drawVideoFrame(context, canvas, tileData, records, yearLabel) {
		var mapSize = map.getSize();
		var scaleX = canvas.width / mapSize.x;
		var scaleY = canvas.height / mapSize.y;
		context.fillStyle = '#fff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		tileData.forEach(function (tile) {
			context.globalAlpha = tile.opacity;
			context.drawImage(tile.image, tile.x * scaleX, tile.y * scaleY, tile.width * scaleX, tile.height * scaleY);
		});
		context.globalAlpha = 1;
		records.forEach(function (record) {
			var point = map.latLngToContainerPoint(record.latlng);
			var x = point.x * scaleX, y = point.y * scaleY;
			var color = record.year === null ? '#777' : yearColor(record.year);
			context.beginPath();
			context.arc(x, y, 4 * (scaleX + scaleY) / 2, 0, Math.PI * 2);
			context.fillStyle = record.year === null ? '#aaa' : color;
			context.strokeStyle = record.year === null ? '#666' : color;
			context.lineWidth = Math.max(1, scaleX);
			context.fill();
			context.stroke();
		});
		if (yearLabel !== null) {
			var text = String(yearLabel).toLocaleUpperCase('da-DK');
			context.save();
			context.font = 'bold ' + Math.max(30, Math.round(canvas.width * 0.045)) + 'px system-ui, sans-serif';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			context.lineJoin = 'round';
			context.lineWidth = 7 * scaleX;
			context.strokeStyle = '#fff';
			context.fillStyle = '#000';
			context.strokeText(text, 20 * scaleX, 18 * scaleY);
			context.fillText(text, 20 * scaleX, 18 * scaleY);
			context.restore();
		}
		var attributionLines = [
			activeLayerAttribution,
			'BBR-data fra Vurderingsstyrelsen',
			'Lavet via bbr.findvej.dk'
		];
		context.save();
		context.font = Math.max(10, Math.round(12 * scaleX)) + 'px sans-serif';
		context.textAlign = 'right';
		context.textBaseline = 'bottom';
		var paddingX = Math.max(4, 5 * scaleX);
		var rightMargin = Math.max(4, 8 * scaleX);
		var maxAttributionWidth = canvas.width - rightMargin - 8 * scaleX - paddingX * 2;
		var wrappedAttributions = [];
		attributionLines.forEach(function (attribution) {
			var line = '';
			attribution.split(/\s+/).forEach(function (word) {
				var candidate = line ? line + ' ' + word : word;
				if (line && context.measureText(candidate).width > maxAttributionWidth) {
					wrappedAttributions.push(line);
					line = word;
				} else {
					line = candidate;
				}
			});
			if (line) {
				wrappedAttributions.push(line);
			}
		});
		var attributionWidth = wrappedAttributions.reduce(function (width, line) {
			return Math.max(width, context.measureText(line).width);
		}, 0);
		var right = canvas.width - rightMargin;
		var bottom = canvas.height - 6 * scaleY;
		var lineHeight = Math.max(12, 16 * scaleY);
		var paddingY = Math.max(3, 4 * scaleY);
		var boxHeight = wrappedAttributions.length * lineHeight + paddingY * 2;
		context.fillStyle = 'rgba(255,255,255,0.8)';
		context.fillRect(right - attributionWidth - paddingX * 2, bottom - boxHeight, attributionWidth + paddingX * 2, boxHeight);
		context.fillStyle = '#222';
		wrappedAttributions.forEach(function (line, index) {
			context.fillText(line, right - paddingX, bottom - paddingY - (wrappedAttributions.length - index - 1) * lineHeight);
		});
		context.restore();
	}

	function makeVideoRecords(features) {
		return features.filter(function (feature) {
			var coordinates = feature.geometry && feature.geometry.coordinates;
			return coordinates && coordinates.length >= 2;
		}).map(function (feature) {
			var coordinates = feature.geometry.coordinates;
			var latlng = utm32ToLatLng(coordinates[0], coordinates[1]);
			return {
				feature: feature,
				latlng: L.latLng(latlng[0], latlng[1]),
				year: featureYear(feature)
			};
		});
	}

	function recordsForExportYear(records, year) {
		return records.filter(function (record) {
			return record.year === null ? showInvalid.checked : record.year <= year;
		});
	}

	function recordsForExportStep(records, step, steps) {
		return records.slice(0, pointCountForStep(step, records.length, steps));
	}

	function lastValidYear(records, fallbackYear) {
		for (var i = records.length - 1; i >= 0; i--) {
			if (records[i].year !== null) {
				return records[i].year;
			}
		}
		return fallbackYear;
	}

	function setExportBusy(busy) {
		var controls = Array.from(document.querySelectorAll('#year-control button, #year-control select, #year-control input, #address-search input'));
		if (busy) {
			exportCancelRequested = false;
			exportControlStates = controls.map(function (control) {
				return { control: control, disabled: control.disabled };
			});
			exportControlStates.forEach(function (state) {
				if (state.control !== exportButton && state.control !== cancelExportButton) {
					state.control.disabled = true;
				}
			});
		} else if (exportControlStates) {
			exportControlStates.forEach(function (state) {
				if (state.control !== exportButton && state.control !== cancelExportButton) {
					state.control.disabled = state.disabled;
				}
			});
			exportControlStates = null;
		}
		exportButton.disabled = busy;
		cancelExportButton.hidden = !busy;
		cancelExportButton.disabled = !busy;
		if (!busy) {
			exportCancelRequested = false;
		}
		document.getElementById('map').classList.toggle('exporting', busy);
		['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard'].forEach(function (handler) {
			if (map[handler]) {
				if (busy) {
					map[handler].disable();
				} else {
					map[handler].enable();
				}
			}
		});
	}

	function cancelVideoExport() {
		if (cancelExportButton.disabled) {
			return;
		}
		exportCancelRequested = true;
		cancelExportButton.disabled = true;
		exportStatus.textContent = 'Afbryder videoeksport …';
	}

	async function exportVideo() {
		if (!allFeatures.length) {
			exportStatus.textContent = 'Der er ingen punkter i kortudsnittet at eksportere.';
			return;
		}
		stopAnimation();
		setExportBusy(true);
		exportStatus.textContent = 'Indlæser videokoder …';
		var output;
		var videoSource;
		try {
			var mediabunny = await import(MEDIABUNNY_MODULE_URL);
			checkExportCancellation();
			var mapSize = map.getSize();
			var canvas = document.createElement('canvas');
			canvas.width = Math.max(2, Math.floor(mapSize.x / 2) * 2);
			canvas.height = Math.max(2, Math.floor(mapSize.y / 2) * 2);
			var context = canvas.getContext('2d', { alpha: false });
			if (!context) {
				throw new Error('Browseren kunne ikke oprette et canvas til videoeksport.');
			}
			var tileData = await getTileDrawData();
			checkExportCancellation();
			var pointMode = animationMode === 'points';
			var allRecords = makeVideoRecords(pointMode ? pointFeaturesCache : allFeatures);
			var validYears = allRecords.map(function (record) { return record.year; }).filter(function (year) { return year !== null; });
			var frameValues;
			var frameCount;
			var minYear = validYears.length ? Math.min.apply(null, validYears) : 0;
			if (pointMode) {
				var steps = pointStepCount(allRecords);
				if (!steps) {
					throw new Error('Der er ingen punkter at eksportere med de valgte filtre.');
				}
				frameValues = Array.from({ length: steps }, function (_, index) { return index + 1; });
				frameCount = frameValues.length;
			} else {
				if (!validYears.length) {
					throw new Error('Der er ingen gyldige byggeår at eksportere.');
				}
				var maxYear = Math.max.apply(null, validYears);
				frameCount = maxYear - minYear + 1;
				frameValues = Array.from({ length: frameCount }, function (_, index) { return minYear + index; });
			}
			var format = new mediabunny.Mp4OutputFormat({ fastStart: false });
			var codec;
			var codecError;
			try {
				codec = await mediabunny.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
					width: canvas.width,
					height: canvas.height
				});
			} catch (error) {
				codecError = error;
			}
			checkExportCancellation();
			var extension = '.mp4';
			if (!codec) {
				format = new mediabunny.WebMOutputFormat();
				try {
					codec = await mediabunny.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
						width: canvas.width,
						height: canvas.height
					});
				} catch (error) {
					codecError = error;
				}
				checkExportCancellation();
				extension = '.webm';
			}
			if (!codec) {
				throw new Error('Browseren understøtter ikke en kompatibel videokoder.'
					+ (codecError ? ' ' + codecError.message : ''));
			}
			output = new mediabunny.Output({
				format: format,
				target: new mediabunny.BufferTarget()
			});
			videoSource = new mediabunny.CanvasSource(canvas, {
				codec: codec,
				quality: new mediabunny.Quality('medium')
			});
			output.addVideoTrack(videoSource, { frameRate: VIDEO_FRAME_RATE });
			await output.start();
			checkExportCancellation();
			for (var frame = 0; frame < frameCount; frame++) {
				checkExportCancellation();
				var value = frameValues[frame];
				var frameRecords;
				var yearLabel;
				if (pointMode) {
					frameRecords = recordsForExportStep(allRecords, value, frameCount);
					yearLabel = lastValidYear(frameRecords, minYear || 'Ukendt år');
				} else {
					frameRecords = recordsForExportYear(allRecords, value);
					yearLabel = value;
				}
				drawVideoFrame(context, canvas, tileData, frameRecords, yearLabel);
				if (frame === 0) {
					try {
						context.getImageData(0, 0, 1, 1);
					} catch (error) {
						throw new Error('Kortfliserne tillader ikke videoeksport fra denne browser eller korttjeneste (CORS).');
					}
				}
				await videoSource.add(frame / VIDEO_FRAME_RATE, 1 / VIDEO_FRAME_RATE);
				checkExportCancellation();
				if (frame % 5 === 0 || frame === frameCount - 1) {
					exportStatus.textContent = 'Eksporterer frame ' + (frame + 1) + ' af ' + frameCount + ' …';
					await new Promise(function (resolve) { setTimeout(resolve, 0); });
				}
			}
			exportStatus.textContent = 'Holder slutbilledet i 2 sekunder …';
			var holdFrameCount = VIDEO_FRAME_RATE * 2;
			for (var holdFrame = 0; holdFrame < holdFrameCount; holdFrame++) {
				checkExportCancellation();
				await videoSource.add((frameCount + holdFrame) / VIDEO_FRAME_RATE, 1 / VIDEO_FRAME_RATE);
				checkExportCancellation();
				if (holdFrame % 10 === 9) {
					await new Promise(function (resolve) { setTimeout(resolve, 0); });
				}
			}
			checkExportCancellation();
			videoSource.close();
			exportStatus.textContent = 'Færdiggør video …';
			await output.finalize();
			checkExportCancellation();
			var blob = new Blob([output.target.buffer], { type: format.mimeType });
			var url = URL.createObjectURL(blob);
			var link = document.createElement('a');
			link.href = url;
			link.download = 'bbr-tidslinje' + extension;
			link.click();
			setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
			exportStatus.textContent = 'Videoen er klar som ' + extension.toUpperCase().slice(1)
				+ ' (' + (blob.size / 1024 / 1024).toFixed(1) + ' MB).';
		} catch (error) {
			var message = error && error.message ? error.message : String(error);
			var cancelled = exportCancelRequested || (error && error.name === 'AbortError');
			var cleanupErrors = [];
			if (videoSource) {
				try {
					videoSource.close();
				} catch (closeError) {
					cleanupErrors.push('Lukning af videokoderen mislykkedes: ' + closeError.message);
				}
			}
			if (output && output.state !== 'finalized' && output.state !== 'canceled') {
				try {
					await output.cancel();
				} catch (cancelError) {
					cleanupErrors.push('Oprydning mislykkedes: ' + cancelError.message);
				}
			}
			exportStatus.textContent = cancelled
				? 'Videoeksport afbrudt.' + (cleanupErrors.length ? ' ' + cleanupErrors.join(' ') : '')
				: 'Videoeksport mislykkedes: ' + message
					+ (cleanupErrors.length ? ' ' + cleanupErrors.join(' ') : '');
		} finally {
			setExportBusy(false);
		}
	}

	function initMap() {
		var view = readInitialView();
		var osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: OSM_MAX_ZOOM_LEVEL,
			crossOrigin: true,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		});
		var aerialLayer = L.tileLayer.wms(
			DATAFORSYNINGEN_URL + '/orto_foraar_DAF?service=WMS&token=' + encodeURIComponent(DATAFORSYNINGEN_TOKEN) + '&',
			{
				layers: 'orto_foraar_12_5',
				maxZoom: AERIAL_MAX_ZOOM_LEVEL,
				crossOrigin: true,
				attribution: 'Indeholder data fra Klimadatastyrelsen, Ortofoto Forår, WMS-tjeneste'
			}
		);
		map = L.map('map', {
			center: view.center,
			zoom: view.zoom,
			minZoom: 0,
			maxZoom: OSM_MAX_ZOOM_LEVEL,
			layers: [osmLayer],
			preferCanvas: true
		});
		activeBaseLayer = osmLayer;
		L.control.layers({ 'OpenStreetMap': osmLayer, 'Luftfoto': aerialLayer }).addTo(map);
		map.on('baselayerchange', function (event) {
			activeBaseLayer = event.layer;
			activeLayerAttribution = event.layer === osmLayer
				? '© OpenStreetMap contributors' : 'Indeholder data fra Klimadatastyrelsen, Ortofoto Forår';
			var maxZoom = event.layer.options.maxZoom;
			map.setMaxZoom(maxZoom);
			if (map.getZoom() > maxZoom) {
				map.setZoom(maxZoom);
			}
		});
		L.control.scale({ imperial: false }).addTo(map);
		canvasRenderer = L.canvas({ padding: 0.5 });
		buildingLayer = L.layerGroup().addTo(map);

		var ObliqueControl = L.Control.extend({
			options: { position: 'topleft' },
			onAdd: function () {
				var container = L.DomUtil.create('div', 'leaflet-bar oblique-control');
				obliqueLink = L.DomUtil.create('a', '', container);
				obliqueLink.href = obliqueUrl(map.getCenter());
				obliqueLink.target = '_blank';
				obliqueLink.rel = 'noopener';
				obliqueLink.textContent = '✈';
				obliqueLink.title = 'Åbn skråfoto ved kortets centrum';
				L.DomEvent.disableClickPropagation(container);
				return container;
			}
		});
		map.addControl(new ObliqueControl());

		map.on('resize', function () {
			if (animationMode === 'year' && !yearHistogram.hidden) {
				drawYearHistogram();
			}
		});
		map.on('moveend', function () {
			stopAnimation();
			obliqueLink.href = obliqueUrl(map.getCenter());
			updateHash();
			loadFeatures();
		});
		slider.addEventListener('input', function () {
			stopAnimation();
			setTimelineValue(Number(slider.value));
		});
		showInvalid.addEventListener('change', function () {
			stopAnimation();
			updateYearControl();
			renderFeatures();
		});
		animationModeSelect.addEventListener('change', function () {
			stopAnimation();
			animationMode = animationModeSelect.value;
			if (animationMode === 'points') {
				selectedPointStep = null;
			}
			updateYearControl();
			renderFeatures();
		});
		yearStartButton.addEventListener('click', function () {
			stopAnimation();
			setTimelineValue(Number(slider.min));
		});
		yearBackButton.addEventListener('click', function () {
			stopAnimation();
			setTimelineValue(Number(slider.value) - 1);
		});
		yearPlayButton.addEventListener('click', function () {
			if (animationTimer === null) {
				startAnimation();
			} else {
				stopAnimation();
			}
		});
		yearForwardButton.addEventListener('click', function () {
			stopAnimation();
			setTimelineValue(Number(slider.value) + 1);
		});
		yearEndButton.addEventListener('click', function () {
			stopAnimation();
			setTimelineValue(Number(slider.max));
		});
		yearSpeed.addEventListener('change', updateAnimationSpeed);
		cancelExportButton.addEventListener('click', cancelVideoExport);
		aboutToggle.addEventListener('click', function (event) {
			event.preventDefault();
			var expanded = aboutToggle.getAttribute('aria-expanded') !== 'true';
			aboutToggle.setAttribute('aria-expanded', String(expanded));
			serviceInfoText.hidden = !expanded;
		});
		exportButton.addEventListener('click', exportVideo);
		setupAddressSearch();
		loadFeatures();
	}

	initMap();
}());
