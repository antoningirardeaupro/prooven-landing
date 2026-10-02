/* Prooven : liste d'attente, calculateur de taux d'engagement, mesure d'audience sans cookie.
   Aucun cookie, aucun identifiant : on compte des pages vues, rien de plus.
   Les écritures vont dans Supabase avec la clé publique (anon). La base n'autorise
   que l'insertion : personne ne peut relire la liste depuis le site. */
(function () {
  'use strict';
  var SB = 'https://soivikmwtzwohsjkfroq.supabase.co/rest/v1/';
  var KEY = 'sb_publishable_b8tVM1adtg6UPG50ogYYbw_5N0hByqV';
  var LANG = document.documentElement.lang === 'en' ? 'en' : 'fr';
  var SITE = LANG === 'en' ? 'getprooven.com' : 'prooven.fr';
  var LIVE = location.hostname === SITE || location.hostname === 'www.' + SITE;

  function post(table, row) {
    return fetch(SB + table, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row)
    });
  }

  // ─── mesure d'audience : page, domaine d'origine, type d'événement. Rien d'autre.
  function track(evenement) {
    if (!LIVE) return;
    var prov = null;
    try {
      if (document.referrer) {
        var h = new URL(document.referrer).hostname;
        if (h && h !== location.hostname) prov = h.slice(0, 120);
      }
    } catch (e) { /* referrer illisible : on ignore */ }
    post('prooven_site_events', { site: SITE, chemin: location.pathname.slice(0, 200), evenement: evenement, provenance: prov })
      .catch(function () {});
  }
  track('vue');

  // ─── liste d'attente
  var TXT = {
    fr: { ok: "C'est noté\u00a0! Tu seras prévenu au lancement de Prooven.", deja: 'Tu es déjà sur la liste. On te prévient au lancement.',
          mail: 'Cette adresse email ne semble pas valide.', consent: "Coche la case pour qu'on puisse t'écrire au lancement.",
          err: "Oups, l'envoi n'a pas marché. Réessaie, ou écris à antonin@prooven.fr.", wait: 'Envoi…' },
    en: { ok: "You're on the list! We'll let you know when Prooven launches.", deja: "You're already on the list. We'll let you know at launch.",
          mail: "This email address doesn't look valid.", consent: 'Tick the box so we can email you at launch.',
          err: "Oops, that didn't go through. Try again, or write to antonin@prooven.fr.", wait: 'Sending…' }
  }[LANG];

  function cleanInsta(v) {
    v = (v || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@+/, '');
    return v ? ('@' + v).slice(0, 60) : null;
  }

  Array.prototype.forEach.call(document.querySelectorAll('form.wl'), function (f) {
    var msg = f.querySelector('.wl-msg');
    var btn = f.querySelector('button');
    function say(text, ok) { msg.textContent = text; msg.className = 'wl-msg ' + (ok ? 'is-ok' : 'is-err'); }
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (f.querySelector('[name=site_web]').value) return; // champ piège : seuls les robots le remplissent
      var email = f.querySelector('[name=email]').value.trim();
      var consent = f.querySelector('[name=consentement]').checked;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return say(TXT.mail, false);
      if (!consent) return say(TXT.consent, false);
      var insta = f.querySelector('[name=instagram]');
      btn.disabled = true; var label = btn.textContent; btn.textContent = TXT.wait;
      post('prooven_waitlist', { email: email, instagram: cleanInsta(insta && insta.value), langue: LANG, source: (f.dataset.source || 'site').slice(0, 80), consentement: true })
        .then(function (r) {
          if (r.status === 201) { say(TXT.ok, true); f.classList.add('done'); track('inscription'); }
          else if (r.status === 409) { say(TXT.deja, true); f.classList.add('done'); }
          else say(TXT.err, false);
        })
        .catch(function () { say(TXT.err, false); })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });

  // ─── calculateur de revenus (barèmes en € pour 1 000 vues, posés par la page dans data-rates)
  var rev = document.getElementById('rev');
  if (rev) (function () {
    var R = JSON.parse(rev.dataset.rates);
    var T2 = {
      fr: {
        short: 'TikTok ne paie que les vidéos de plus d\'1 minute. Une vidéo plus courte ne rapporte rien, même avec des millions de vues.',
        tiktok: function (q) { return 'Sur ' + q + ' vues qualifiées (vues de plus de 5 secondes, venues des pays éligibles). Il faut 10 000 abonnés, 100 000 vues sur 30 jours et avoir 18 ans.'; },
        yt: 'Il faut être dans le Programme Partenaire YouTube. À partir du 1er février 2027, il faudra en plus 10 millions de vues Shorts sur 90 jours pour toucher ces revenus.',
        ig: 'Instagram ne paie pas les vues en France. Ses bonus sont sur invitation, sans barème public. L\'argent d\'Instagram vient des marques.',
        range: function (a, b) { return 'entre ' + a + ' et ' + b; },
        need: 'Entre un nombre de vues.'
      },
      en: {
        short: 'TikTok only pays for videos longer than 1 minute. A shorter video earns nothing, even with millions of views.',
        tiktok: function (q) { return 'Based on ' + q + ' qualified views (views over 5 seconds, from eligible countries). You need 10,000 followers, 100,000 views in 30 days and to be 18+.'; },
        yt: 'You must be in the YouTube Partner Program. From February 1, 2027, you will also need 10 million Shorts views over 90 days to earn this revenue.',
        ig: 'Instagram does not pay per view. Its bonuses are invite-only, with no public rates. Instagram money comes from brand deals.',
        range: function (a, b) { return 'between ' + a + ' and ' + b; },
        need: 'Enter a number of views.'
      }
    }[LANG];
    var eur = function (x) {
      var d = x > 0 && x < 10 ? 2 : 0;
      var s = x.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      return LANG === 'fr' ? s + ' €' : '€' + s;
    };
    var plat = 'tiktok';
    var tabs2 = rev.querySelectorAll('[role=tab]');
    Array.prototype.forEach.call(tabs2, function (t) {
      t.addEventListener('click', function () {
        plat = t.dataset.plat;
        Array.prototype.forEach.call(tabs2, function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        rev.dataset.plat = plat; go();
      });
    });
    var res = rev.querySelector('.res');
    var did = false;
    function go() {
      var vues = num(rev.querySelector('[name=vues]').value);
      var pays = rev.querySelector('[name=pays]').value;
      var big = res.querySelector('.big'), sub = res.querySelector('.lab2'), txt = res.querySelector('.txt');
      if (!vues) { res.hidden = true; return; }
      res.hidden = false;
      if (!did) { did = true; track('calcul'); }
      if (plat === 'instagram') { big.textContent = eur(0); sub.textContent = ''; txt.textContent = T2.ig; return; }
      var base = vues, r = R[plat][pays];
      if (plat === 'tiktok') {
        if (!rev.querySelector('[name=long]').checked) { big.textContent = eur(0); sub.textContent = ''; txt.textContent = T2.short; return; }
        base = vues * Number(rev.querySelector('[name=qualif]').value) / 100;
      }
      big.textContent = '≈ ' + eur(base * r[1] / 1000);
      sub.textContent = T2.range(eur(base * r[0] / 1000), eur(base * r[2] / 1000));
      txt.textContent = plat === 'tiktok' ? T2.tiktok(Math.round(base).toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-US')) : T2.yt;
    }
    rev.addEventListener('input', go);
    rev.addEventListener('change', go);
    rev.addEventListener('submit', function (e) { e.preventDefault(); go(); });
    go();
  })();

  // ─── calculateur
  var calc = document.getElementById('calc');
  if (!calc) return;
  var B = JSON.parse(calc.dataset.bench); // repères (en %) : p25, p50, p75, p90
  var SECT = JSON.parse(calc.dataset.sectors);
  var fmt = function (x, d) {
    return x.toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  var pct = function (x) { return LANG === 'fr' ? fmt(x, 1) + ' %' : fmt(x, 1) + '%'; };

  // accepte « 12 500 », « 12.5k », « 1,2 M », « 3 millions »
  function num(v) {
    v = String(v || '').trim().toLowerCase().replace(/\s| | /g, '');
    if (!v) return 0;
    var mult = 1;
    var m = v.match(/(k|m|millions?|mio|md)$/);
    if (m) { mult = m[1] === 'k' ? 1e3 : 1e6; v = v.slice(0, -m[1].length); }
    if (mult > 1) v = v.replace(',', '.');
    else if (/^\d{1,3}([.,]\d{3})+$/.test(v)) v = v.replace(/[.,]/g, '');
    else v = v.replace(',', '.');
    var n = parseFloat(v);
    return isFinite(n) && n > 0 ? n * mult : 0;
  }

  var L = {
    fr: {
      bands: [
        ['Bas', 'Plus bas que 3 vidéos virales sur 4. Ta vidéo est vue, mais peu de gens réagissent\u00a0: travaille l\'accroche et la fin qui donne envie de commenter.'],
        ['Correct', 'Sous la moyenne des vidéos virales, mais dans la course. Une raison claire de partager ou d\'enregistrer peut tout changer.'],
        ['Bon', 'Au-dessus de la moyenne des vidéos virales. Les gens réagissent\u00a0: garde ce format et teste d\'autres accroches.'],
        ['Excellent', 'Mieux que 3 vidéos virales sur 4. Ce format marche pour toi\u00a0: refais-le.'],
        ['Exceptionnel', 'Dans le top 10 % des vidéos virales. Analyse ce qui a marché et décline-le.']
      ],
      needViews: 'Entre le nombre de vues de la vidéo.', needFollowers: 'Entre ton nombre d\'abonnés.',
      sector: function (s, v) { return 'En ' + s + ', les vidéos virales font ' + v + ' en moyenne.'; },
      follow: 'Pour comparer avec nos repères, passe en mode «\u00a0par vues\u00a0»\u00a0: nos chiffres viennent des vues, que TikTok et Instagram mettent en avant.'
    },
    en: {
      bands: [
        ['Low', 'Lower than 3 out of 4 viral videos. People watch, but few react: work on the hook and on an ending that makes people comment.'],
        ['Fair', 'Below the viral average, but in the race. A clear reason to share or save can change everything.'],
        ['Good', 'Above the viral average. People react: keep this format and test other hooks.'],
        ['Excellent', 'Better than 3 out of 4 viral videos. This format works for you: do it again.'],
        ['Outstanding', 'In the top 10% of viral videos. Study what worked and make more like it.']
      ],
      needViews: 'Enter the video\'s view count.', needFollowers: 'Enter your follower count.',
      sector: function (s, v) { return 'In ' + s + ', viral videos average ' + v + '.'; },
      follow: 'To compare with our benchmarks, switch to "by views": our numbers come from views, which TikTok and Instagram now put first.'
    }
  }[LANG];

  var mode = 'vues';
  var out = calc.querySelector('.res');
  var tabs = calc.querySelectorAll('[role=tab]');
  Array.prototype.forEach.call(tabs, function (t) {
    t.addEventListener('click', function () {
      mode = t.dataset.mode;
      Array.prototype.forEach.call(tabs, function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
      calc.classList.toggle('m-abonnes', mode === 'abonnes');
      run();
    });
  });

  var tracked = false;
  function run() {
    var g = function (n) { return num(calc.querySelector('[name=' + n + ']').value); };
    var likes = g('likes'), com = g('commentaires'), part = g('partages'), enr = g('enregistrements');
    var base = mode === 'vues' ? g('vues') : g('abonnes');
    var inter = mode === 'vues' ? likes + com + part + enr : likes + com;
    if (!inter && !base) { out.hidden = true; return; }
    out.hidden = false;
    var big = out.querySelector('.big'), lab = out.querySelector('.lab'), txt = out.querySelector('.txt'), sec = out.querySelector('.sec');
    var gauge = out.querySelector('.gauge');
    if (!base) {
      big.textContent = '…'; lab.textContent = ''; sec.textContent = ''; gauge.hidden = true;
      txt.textContent = mode === 'vues' ? L.needViews : L.needFollowers; return;
    }
    var r = 100 * inter / base;
    big.textContent = pct(r);
    if (!tracked) { tracked = true; track('calcul'); }
    if (mode === 'abonnes') {
      lab.textContent = ''; gauge.hidden = true; sec.textContent = ''; txt.textContent = L.follow; return;
    }
    var i = r < B[0] ? 0 : r < B[1] ? 1 : r < B[2] ? 2 : r < B[3] ? 3 : 4;
    lab.textContent = L.bands[i][0]; lab.dataset.band = i;
    txt.textContent = L.bands[i][1];
    gauge.hidden = false;
    var max = 15;
    gauge.querySelector('.you').style.left = Math.min(r, max) / max * 100 + '%';
    var s = calc.querySelector('[name=secteur]').value;
    sec.textContent = s && SECT[s] != null ? L.sector(s, pct(SECT[s])) : '';
  }
  calc.addEventListener('input', run);
  calc.addEventListener('change', run);
  calc.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  run();
})();
