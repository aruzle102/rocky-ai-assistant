package com.modaliadz.rocky

/**
 * Built-in restaurant scaffold. Used ONLY when no model is available or
 * when a model's plan cannot be parsed. It MUST be labelled
 * "scaffold tool (not model output)" wherever it is used — never presented
 * as model-generated. Gallery art is CSS/SVG-style gradient art, not
 * hotlinked photos, so the site works fully offline.
 */
object RestaurantScaffold {
    fun files(): Map<String, String> = mapOf(
        "index.html" to """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Le Jardin Restaurant</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header>
<h1>Le Jardin Restaurant</h1>
<p>Fresh, seasonal cooking in the heart of the city.</p>
<nav>
<a href="#menu">Menu</a>
<a href="#gallery">Gallery</a>
<a href="#reservation">Reservation</a>
</nav>
</header>
<main>
<section id="menu">
<h2>Menu</h2>
<div class="filters">
<button data-filter="all">All</button>
<button data-filter="starters">Starters</button>
<button data-filter="mains">Mains</button>
<button data-filter="desserts">Desserts</button>
<button data-filter="drinks">Drinks</button>
</div>
<h3>Starters</h3>
<ul>
<li class="menu-item" data-cat="starters">Garden Salad — 600 DA</li>
<li class="menu-item" data-cat="starters">Soup of the Day — 450 DA</li>
</ul>
<h3>Mains</h3>
<ul>
<li class="menu-item" data-cat="mains">Grilled Chicken — 1 200 DA</li>
<li class="menu-item" data-cat="mains">Pasta Primavera — 950 DA</li>
</ul>
<h3>Desserts</h3>
<ul>
<li class="menu-item" data-cat="desserts">Chocolate Cake — 500 DA</li>
<li class="menu-item" data-cat="desserts">Fruit Tart — 450 DA</li>
</ul>
<h3>Drinks</h3>
<ul>
<li class="menu-item" data-cat="drinks">Fresh Juice — 300 DA</li>
<li class="menu-item" data-cat="drinks">Mint Tea — 200 DA</li>
</ul>
</section>
<section id="gallery">
<h2>Gallery</h2>
<p>Gallery art below is gradient art made with CSS — no external photos, so this page works offline.</p>
<div class="gallery">
<div class="gallery-art" style="background:linear-gradient(135deg,#2f7bff,#22d3ee)">Dining Room</div>
<div class="gallery-art" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">Grilled Dish</div>
<div class="gallery-art" style="background:linear-gradient(135deg,#10b981,#22d3ee)">Garden Salad</div>
<div class="gallery-art" style="background:linear-gradient(135deg,#8b5cf6,#ec4899)">Dessert</div>
<div class="gallery-art" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">Drinks</div>
<div class="gallery-art" style="background:linear-gradient(135deg,#f97316,#facc15)">Chef Special</div>
</div>
<p id="galleryCaption">Tap a gallery tile to see its caption.</p>
</section>
<section id="reservation">
<h2>Reservation</h2>
<form id="reservationForm">
<label>Name <input id="resName" type="text" required></label>
<label>Phone <input id="resPhone" type="tel" required></label>
<label>Date <input id="resDate" type="date" required></label>
<label>Time <input id="resTime" type="time" required></label>
<label>Guests <input id="resGuests" type="number" min="1" max="20" value="2" required></label>
<button type="submit">Reserve a table</button>
</form>
<p id="reservationMsg"></p>
<p class="demo-note">Demo form: the reservation is confirmed locally only. No reservation is sent to any backend unless a real endpoint is configured.</p>
</section>
</main>
<footer><p>Le Jardin Restaurant — built by ROCKY AI.</p></footer>
<script src="script.js"></script>
</body>
</html>
""".trimIndent(),
        "styles.css" to """
body { font-family: system-ui, sans-serif; margin: 0; background: #0b1220; color: #e6f1ff; }
header { background: #123a7a; padding: 24px; text-align: center; }
nav a { color: #22d3ee; margin: 0 10px; text-decoration: none; }
main { max-width: 900px; margin: 0 auto; padding: 16px; }
section { margin: 32px 0; }
.filters button, form button { background: #2f7bff; color: #fff; border: 0; border-radius: 999px; padding: 10px 16px; margin: 4px; cursor: pointer; }
.gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.gallery-art { height: 140px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-weight: bold; cursor: pointer; }
form label { display: block; margin: 10px 0; }
form input { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #1e3a5f; background: #0a1424; color: #fff; box-sizing: border-box; }
.demo-note { font-size: 13px; opacity: 0.75; }
@media (max-width: 700px) {
  .gallery { grid-template-columns: 1fr; }
  header { padding: 16px; }
}
""".trimIndent(),
        "script.js" to """
(function () {
  var buttons = document.querySelectorAll('[data-filter]');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var f = btn.getAttribute('data-filter');
      document.querySelectorAll('.menu-item').forEach(function (item) {
        var cat = item.getAttribute('data-cat');
        item.style.display = (f === 'all' || cat === f) ? '' : 'none';
      });
    });
  });
  document.querySelectorAll('.gallery-art').forEach(function (tile) {
    tile.addEventListener('click', function () {
      document.getElementById('galleryCaption').textContent = tile.textContent;
    });
  });
  var form = document.getElementById('reservationForm');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('resName').value.trim();
    var phone = document.getElementById('resPhone').value.trim();
    var date = document.getElementById('resDate').value;
    var time = document.getElementById('resTime').value;
    var guests = parseInt(document.getElementById('resGuests').value, 10);
    var msg = document.getElementById('reservationMsg');
    if (!name || !phone || !date || !time || isNaN(guests) || guests < 1 || guests > 20) {
      msg.textContent = 'Please fill every field correctly (guests: 1 to 20).';
      return;
    }
    msg.textContent = 'Thank you, ' + name + ' — your table for ' + guests + ' on ' + date + ' at ' + time + ' is noted (demo form — no reservation is sent).';
  });
})();
""".trimIndent()
    )
}
