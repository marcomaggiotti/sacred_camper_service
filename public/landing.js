(function () {
  'use strict';

  var verdict = document.getElementById('verdict');

  document.getElementById('agree').addEventListener('click', function () {
    verdict.textContent = 'Benvenuto a bordo! Ti porto al dashboard…';
    // The dashboard sends anonymous visitors on to the login page.
    setTimeout(function () {
      window.location.href = '/dashboard';
    }, 700);
  });

  document.getElementById('disagree').addEventListener('click', function () {
    verdict.textContent =
      'Rispettiamo il dissenso, ma il camper resta sacro. Nessuna prenotazione per te oggi.';
  });
})();
