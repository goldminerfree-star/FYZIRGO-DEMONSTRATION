/* Donnees test */
const stockage = "fyzirgo-v1";
const versionStockage = 1;
const donneesInitiales = {
  patients: [
    { id: 1, nom: "Patient test A", pathologies: [{ nom: "Suivi test", note: "Donnée de démonstration" }], notes: "Note générale", adressePostale: "Adresse test", localisation: "48.8566, 2.3522", latitude: 48.8566, longitude: 2.3522, heureDebut: "08:00", heureFin: "08:30", frequence: "unique", dateVisite: "2026-10-08" },
    { id: 2, nom: "Patient test B", pathologies: [{ nom: "Mobilité test", note: "Donnée de démonstration" }], notes: "Note générale", adressePostale: "Adresse test", localisation: "48.8584, 2.2945", latitude: 48.8584, longitude: 2.2945, heureDebut: "09:00", heureFin: "09:30", frequence: "hebdomadaire", dateVisite: "2026-10-08" }
  ],
  tournees: [],
  cataloguePathologies: []
};

let donnees = structuredClone(donneesInitiales);
let filtreActif = "tous";
let messageTimer;
let patientEnEdition = null;
let photoPatient = "";
let patientConsulte = null;
let prochainPatientId = null;
let semaineAffichee = new Date();

/* Stockage appareil */
function ouvrirStockage() {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(stockage, versionStockage);
    requete.onupgradeneeded = () => {
      const base = requete.result;
      if (!base.objectStoreNames.contains("application")) base.createObjectStore("application");
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });
}

async function lireStockage(cle) {
  const base = await ouvrirStockage();
  return new Promise((resoudre, rejeter) => {
    const requete = base.transaction("application", "readonly").objectStore("application").get(cle);
    requete.onsuccess = () => { resoudre(requete.result); base.close(); };
    requete.onerror = () => { rejeter(requete.error); base.close(); };
  });
}

async function ecrireStockage(cle, valeur) {
  const base = await ouvrirStockage();
  return new Promise((resoudre, rejeter) => {
    const requete = base.transaction("application", "readwrite").objectStore("application").put(valeur, cle);
    requete.onsuccess = () => { resoudre(); base.close(); };
    requete.onerror = () => { rejeter(requete.error); base.close(); };
  });
}

async function chargerDonnees() {
  try {
    const sauvegardees = await lireStockage("donnees");
    if (sauvegardees?.patients && sauvegardees?.tournees) return sauvegardees;
    const anciennes = localStorage.getItem(stockage);
    if (anciennes) {
      const migrees = JSON.parse(anciennes);
      localStorage.removeItem(stockage);
      await ecrireStockage("donnees", migrees);
      return migrees;
    }
  } catch { afficherMessage("Stockage local indisponible."); }
  return structuredClone(donneesInitiales);
}

async function sauvegarderDonnees() {
  try { await ecrireStockage("donnees", donnees); }
  catch { afficherMessage("Sauvegarde locale impossible."); }
}

function afficherVue(nom) {
  document.querySelectorAll("[data-view-panel]").forEach((vue) => vue.classList.toggle("active", vue.dataset.viewPanel === nom));
  document.querySelectorAll(".navigation button").forEach((bouton) => bouton.classList.toggle("actif", bouton.dataset.view === nom));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (nom === "patients") afficherPatients();
  if (nom === "tournees") afficherListeTournees();
  if (nom === "planning") afficherPlanning();
  if (nom === "accueil") afficherAccueil();
}

function echapper(texte = "") {
  return String(texte).replace(/[&<>'"]/g, (caractere) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[caractere]);
}

function cartePatient(patient, selection = false) {
  const horaire = patient.heureDebut && patient.heureFin ? `${patient.heureDebut} - ${patient.heureFin}` : "Horaire à définir";
  const pathologies = (patient.pathologies || (patient.pathologie ? [{ nom: patient.pathologie }] : [])).map((item) => item.nom).join(", ");
  const photo = patient.photo ? `<img class="image-avatar" src="${echapper(patient.photo)}" alt="" />` : "●";
  return `<button class="carte-patient${selection ? " selectionnable" : " ouvrable"}" type="button" data-patient-id="${patient.id}">
    <span class="avatar" aria-hidden="true">${photo}</span>
    <span><span class="nom-patient">${echapper(patient.nom)}</span><span class="detail-patient">${echapper(pathologies || "Pathologie non indiquée")}</span></span>
    <span class="heure-patient">${horaire}</span>${selection ? "" : '<span class="chevron-ligne" aria-hidden="true">›</span>'}
  </button>`;
}

function afficherPatients() {
  const recherche = document.querySelector("#recherche-patient").value.trim().toLowerCase();
  const aujourdHui = dateLocale();
  const patients = donnees.patients.filter((patient) => {
    const contenu = `${patient.nom} ${(patient.pathologies || []).map((item) => item.nom).join(" ")} ${patient.dateVisite}`.toLowerCase();
    return contenu.includes(recherche) && (filtreActif !== "aujourdhui" || patient.dateVisite === aujourdHui);
  });
  document.querySelector("#compteur-patients").textContent = `${patients.length} patient${patients.length > 1 ? "s" : ""}`;
  document.querySelector("#liste-patients").innerHTML = patients.length ? patients.map((patient) => cartePatient(patient)).join("") : '<div class="etat-vide"><span>⌕</span><p>Aucun patient trouvé</p></div>';
}

function afficherAccueil() {
  const aujourdHui = dateLocale();
  const visites = donnees.patients.filter((patient) => patient.dateVisite === aujourdHui);
  const conteneur = document.querySelector("#visites-jour");
  document.querySelector("#compteur-visites").textContent = visites.length;
  conteneur.className = visites.length ? "liste" : "etat-vide";
  conteneur.innerHTML = visites.length ? visites.map((patient) => cartePatient(patient)).join("") : '<span aria-hidden="true">▣</span><p>Aucune visite planifiée</p>';
  afficherProchainPatient();
}

function afficherProchainPatient() {
  const texte = document.querySelector("#prochain-patient");
  const heure = document.querySelector("#heure-prochain-patient");
  const bouton = document.querySelector("#ouvrir-prochain-patient");
  const boutonTournee = document.querySelector("#ouvrir-tournee-active");
  const tournee = donnees.tournees.find((item) => item.id === donnees.tourneeActiveId);
  if (!tournee) { prochainPatientId = null; bouton.disabled = true; boutonTournee.classList.add("cache"); texte.textContent = "Pas de tournée active"; heure.textContent = ""; return; }
  boutonTournee.textContent = `Tournée active · ${tournee.nom}`;
  boutonTournee.classList.remove("cache");
  const patients = tournee.patientIds.map((id) => donnees.patients.find((patient) => patient.id === id)).filter(Boolean).sort((a, b) => (a.heureDebut || "99:99").localeCompare(b.heureDebut || "99:99"));
  if (!patients.length) { prochainPatientId = null; bouton.disabled = true; texte.textContent = "Tournée active vide"; heure.textContent = ""; return; }
  const maintenant = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const prochain = patients.find((patient) => !patient.heureDebut || patient.heureDebut >= maintenant) || patients[0];
  prochainPatientId = prochain.id;
  bouton.disabled = false;
  texte.textContent = prochain.nom;
  heure.textContent = prochain.heureDebut ? `Prévu à ${prochain.heureDebut}` : "Horaire à définir";
}

function afficherTournees() {
  const conteneur = document.querySelector("#liste-tournees");
  if (!donnees.tournees.length) {
    conteneur.innerHTML = '<div class="etat-vide"><span>↪</span><p>Aucune tournée enregistrée</p></div>';
    return;
  }
  conteneur.innerHTML = donnees.tournees.map((tournee) => {
    const patients = tournee.patientIds.map((id) => donnees.patients.find((patient) => patient.id === id)).filter(Boolean);
    const arrets = patients.map((patient) => {
      if (Number.isFinite(patient.latitude) && Number.isFinite(patient.longitude)) return `${patient.latitude},${patient.longitude}`;
      return patient.adressePostale?.trim() || null;
    }).filter(Boolean);
    let url = "";
    if (arrets.length) {
      const destination = arrets.at(-1);
      const parametres = new URLSearchParams({
        api: "1",
        destination,
        travelmode: "driving",
        dir_action: "navigate"
      });
      const etapes = arrets.slice(0, -1);
      if (etapes.length) parametres.set("waypoints", etapes.join("|"));
      url = `https://www.google.com/maps/dir/?${parametres}`;
    }
    const active = donnees.tourneeActiveId === tournee.id;
    return `<article class="carte-tournee"><div class="ligne-tournee"><h2>${echapper(tournee.nom)}</h2><button class="bouton-activer${active ? " actif" : ""}" type="button" data-action="activer-tournee" data-tournee-id="${tournee.id}">${active ? "Tournée active" : "Activer"}</button></div><p>${echapper(tournee.date || "Date à définir")} · ${patients.length} patient${patients.length > 1 ? "s" : ""}</p>${url ? `<a class="lien-itineraire" href="${url}" target="_blank" rel="noreferrer">Ouvrir dans Google Maps</a>` : "<span class=\"aide\">Coordonnées à compléter.</span>"}</article>`;
  }).join("");
}

function activerTournee(id) {
  donnees.tourneeActiveId = donnees.tourneeActiveId === id ? null : id;
  sauvegarderDonnees();
  afficherTournees();
  afficherAccueil();
  afficherMessage(donnees.tourneeActiveId ? "Tournée activée." : "Tournée désactivée.");
}

function afficherPlanning() {
  const groupes = new Map();
  donnees.patients.filter((patient) => patient.dateVisite).sort((a, b) => `${a.dateVisite}${a.heureDebut}`.localeCompare(`${b.dateVisite}${b.heureDebut}`)).forEach((patient) => {
    if (!groupes.has(patient.dateVisite)) groupes.set(patient.dateVisite, []);
    groupes.get(patient.dateVisite).push(patient);
  });
  const conteneur = document.querySelector("#liste-planning");
  conteneur.innerHTML = groupes.size ? [...groupes].map(([date, patients]) => `<section class="jour-planning"><h2>${formaterDate(date)}</h2><div class="liste">${patients.map((patient) => cartePatient(patient)).join("")}</div></section>`).join("") : '<div class="etat-vide"><span>▣</span><p>Aucune visite planifiée</p></div>';
}

function formaterDate(date) {
  if (!date) return "Date à définir";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function dateLocale() {
  const maintenant = new Date();
  const decalage = maintenant.getTimezoneOffset() * 60000;
  return new Date(maintenant - decalage).toISOString().slice(0, 10);
}

function actualiserHorloge() {
  const maintenant = new Date();
  document.querySelector("#date-actuelle").textContent = new Intl.DateTimeFormat("fr-FR").format(maintenant);
  document.querySelector("#heure-actuelle").textContent = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(maintenant);
}

function analyserLocalisation(texte) {
  if (!texte.trim()) return { type: "vide" };
  const valeur = texte.trim().replace(/,/g, ".");
  const motifs = [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /[?&]q=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/];
  for (const motif of motifs) {
    const resultat = valeur.match(motif);
    if (!resultat) continue;
    const latitude = Number(resultat[1]);
    const longitude = Number(resultat[2]);
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude, type: "coordonnees" };
    return { erreur: "Les coordonnées sont hors limites." };
  }
  if (/maps\.app\.goo\.gl|google\.[a-z.]+\/maps/i.test(texte)) return { type: "lien" };
  if (texte.length >= 5) return { type: "adresse" };
  return { erreur: "Saisir une adresse ou des coordonnées valides." };
}

function verifierLocalisation() {
  const champ = document.querySelector("#localisation");
  const aide = document.querySelector("#aide-localisation");
  const resultat = analyserLocalisation(champ.value);
  aide.className = "aide";
  if (resultat.erreur) { aide.classList.add("erreur"); aide.textContent = resultat.erreur; return resultat; }
  if (resultat.type === "coordonnees") { aide.classList.add("succes"); aide.textContent = `Coordonnées reconnues : ${resultat.latitude}, ${resultat.longitude}.`; }
  if (resultat.type === "lien") { aide.classList.add("succes"); aide.textContent = "Lien Google Maps conservé. Compléter les coordonnées si nécessaire."; }
  if (resultat.type === "adresse") aide.textContent = "Adresse enregistrée. Les coordonnées pourront être précisées ensuite.";
  if (resultat.type === "vide") aide.textContent = "Coller une adresse, des coordonnées ou un lien Google Maps.";
  return resultat;
}

/* Recherche adresse */
function rechercherAdresse() {
  const adresse = document.querySelector("#form-patient [name=adressePostale]").value.trim();
  if (!adresse) { afficherMessage("Saisir une adresse postale."); return; }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function collerLienMaps() {
  const champ = document.querySelector("#localisation");
  try {
    const texte = (await navigator.clipboard.readText()).trim();
    if (!texte) throw new Error();
    champ.value = texte;
    const resultat = verifierLocalisation();
    if (resultat.erreur || resultat.type !== "lien") {
      afficherMessage("Le presse-papiers ne contient pas de lien Google Maps.");
      return;
    }
    afficherMessage("Lien ajouté à la fiche.");
  } catch {
    champ.focus();
    afficherMessage("Coller le lien manuellement dans la zone prévue.");
  }
}

/* Pathologies */
function afficherCatalogue() {
  const liste = document.querySelector("#catalogue-pathologies");
  liste.innerHTML = (donnees.cataloguePathologies || []).map((nom) => `<option value="${echapper(nom)}"></option>`).join("");
}

function cartePathologie(pathologie = {}) {
  return `<article class="mini-pathologie"><input class="nom-pathologie" data-pathologie="nom" maxlength="80" value="${echapper(pathologie.nom || "")}" readonly /><div class="actions-mini"><button type="button" data-action="details-pathologie">Détails</button><button type="button" data-action="editer-pathologie">Éditer</button><button class="bouton-supprimer" type="button" data-action="supprimer-pathologie">Supprimer</button></div><label class="detail-pathologie cache">Note liée<textarea data-pathologie="note" rows="3" maxlength="500" placeholder="Note du praticien">${echapper(pathologie.note || "")}</textarea></label></article>`;
}

function remplirPathologies(patient) {
  const pathologies = patient.pathologies || (patient.pathologie ? [{ nom: patient.pathologie, note: "" }] : []);
  document.querySelector("#liste-pathologies").innerHTML = pathologies.map((item) => cartePathologie(item)).join("");
  actualiserPathologies();
}

function actualiserPathologies() {
  const nombre = document.querySelectorAll("#liste-pathologies .mini-pathologie").length;
  document.querySelector("#compteur-pathologies").textContent = `${nombre}/3`;
  document.querySelector("[data-action=\"ajouter-pathologie\"]").disabled = nombre >= 3;
}

function ajouterPathologie() {
  const champ = document.querySelector("#saisie-pathologie");
  const nom = champ.value.trim();
  if (!nom) { afficherMessage("Saisir une pathologie."); return; }
  if (document.querySelectorAll("#liste-pathologies .mini-pathologie").length >= 3) { afficherMessage("Trois pathologies maximum."); return; }
  document.querySelector("#liste-pathologies").insertAdjacentHTML("beforeend", cartePathologie({ nom }));
  donnees.cataloguePathologies ||= [];
  if (!donnees.cataloguePathologies.includes(nom)) donnees.cataloguePathologies.push(nom);
  champ.value = "";
  afficherCatalogue();
  actualiserPathologies();
}

function lirePathologies() {
  return [...document.querySelectorAll("#liste-pathologies .mini-pathologie")].map((carte) => ({ nom: carte.querySelector("[data-pathologie=nom]").value.trim(), note: carte.querySelector("[data-pathologie=note]").value.trim() })).filter((item) => item.nom);
}

function ouvrirPatient(id) {
  const patient = donnees.patients.find((item) => item.id === id);
  if (!patient) return;
  patientEnEdition = id;
  photoPatient = patient.photo || "";
  const formulaire = document.querySelector("#form-patient");
  [...formulaire.elements].forEach((champ) => {
    if (!champ.name) return;
    if (champ.type === "radio") champ.checked = champ.value === patient[champ.name];
    else champ.value = patient[champ.name] || "";
  });
  document.querySelector("#titre-formulaire-patient").textContent = "Modifier patient";
  document.querySelector("#sauvegarder-patient").textContent = "Enregistrer les modifications";
  remplirContacts(patient);
  remplirPathologies(patient);
  remplirPlanning(patient);
  afficherPhoto();
  verifierLocalisation();
  afficherVue("nouveau-patient");
}

function preparerNouveauPatient() {
  patientEnEdition = null;
  photoPatient = "";
  const formulaire = document.querySelector("#form-patient");
  formulaire.reset();
  document.querySelector("#titre-formulaire-patient").textContent = "Nouveau patient";
  document.querySelector("#sauvegarder-patient").textContent = "Enregistrer";
  document.querySelector("#aide-localisation").className = "aide";
  document.querySelector("#aide-localisation").textContent = "Coller une adresse, des coordonnées ou un lien Google Maps.";
  remplirContacts({});
  remplirPathologies({});
  semainesChoisies = [];
  remplirPlanning({});
  afficherPhoto();
}

/* Contacts utiles */
function champValeur(valeur = "") { return echapper(valeur); }

function carteContact(type, contact = {}) {
  const intervenant = type === "intervenant";
  return `<article class="mini-contact" data-type-contact="${type}">
    <div class="ligne-section"><p class="etiquette">${intervenant ? "Intervenant" : "Contact"}</p><button class="bouton-supprimer" type="button" data-action="supprimer-contact">Supprimer</button></div>
    <div class="deux-champs">
      <label>Nom<input data-champ-contact="nom" maxlength="80" value="${champValeur(contact.nom)}" placeholder="Nom" /></label>
      <label>Téléphone<input data-champ-contact="telephone" type="tel" maxlength="30" value="${champValeur(contact.telephone)}" placeholder="Téléphone" /></label>
    </div>
    ${intervenant ? `<div class="deux-champs"><label>Jour passage<select data-champ-contact="jour"><option value="">À définir</option>${["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((jour) => `<option${contact.jour === jour ? " selected" : ""}>${jour}</option>`).join("")}</select></label><label>Horaire passage<input data-champ-contact="horaire" type="time" value="${champValeur(contact.horaire)}" /></label></div>` : ""}
  </article>`;
}

function remplirContacts(patient) {
  const urgences = patient.contactsUrgence || [];
  const intervenants = patient.intervenants || [];
  document.querySelector("#contacts-urgence").innerHTML = urgences.map((contact) => carteContact("urgence", contact)).join("");
  document.querySelector("#contacts-intervenants").innerHTML = intervenants.map((contact) => carteContact("intervenant", contact)).join("");
  actualiserContacts();
}

function ajouterContact(type) {
  const zone = type === "urgence" ? document.querySelector("#contacts-urgence") : document.querySelector("#contacts-intervenants");
  if (zone.querySelectorAll(".mini-contact").length >= 2) { afficherMessage("Deux fiches maximum."); return; }
  zone.insertAdjacentHTML("beforeend", carteContact(type));
  actualiserContacts();
}

function actualiserContacts() {
  const urgences = document.querySelectorAll("#contacts-urgence .mini-contact").length;
  const intervenants = document.querySelectorAll("#contacts-intervenants .mini-contact").length;
  document.querySelector("[data-action=\"ajouter-contact-urgence\"]").disabled = urgences >= 2;
  document.querySelector("[data-action=\"ajouter-intervenant\"]").disabled = intervenants >= 2;
}

/* Planning patient */
const joursSemaine = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const moisAnnee = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
let semainesChoisies = [];

function genererCreneaux() {
  const options = ['<option value="">--:--</option>'];
  for (let heure = 0; heure < 24; heure += 1) for (const minute of [0, 15, 30, 45]) {
    const valeur = `${String(heure).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    options.push(`<option value="${valeur}">${valeur}</option>`);
  }
  document.querySelector("#heure-debut").innerHTML = options.join("");
  document.querySelector("#heure-fin").innerHTML = options.join("");
}

function genererChoixPlanning() {
  const casesJour = (nom) => joursSemaine.map((jour) => `<label><input type="checkbox" name="${nom}" value="${jour}" />${jour.slice(0, 3)}</label>`).join("");
  document.querySelector("#jours-hebdomadaires").innerHTML = casesJour("joursHebdomadaires");
  document.querySelector("#jours-mensuels").innerHTML = casesJour("joursMensuels");
  document.querySelector("#mois-mensuels").innerHTML = moisAnnee.map((mois) => `<label><input type="checkbox" name="moisMensuels" value="${mois}" />${mois.slice(0, 3)}</label>`).join("");
}

function lundiDeSemaine(date) {
  const copie = new Date(date);
  const jour = copie.getDay() || 7;
  copie.setDate(copie.getDate() - jour + 1);
  copie.setHours(12, 0, 0, 0);
  return copie;
}

function numeroSemaine(date) {
  const copie = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = copie.getUTCDay() || 7;
  copie.setUTCDate(copie.getUTCDate() + 4 - jour);
  const annee = copie.getUTCFullYear();
  const debut = new Date(Date.UTC(annee, 0, 1));
  return { annee, numero: Math.ceil((((copie - debut) / 86400000) + 1) / 7) };
}

function afficherSemaine() {
  const lundi = lundiDeSemaine(semaineAffichee);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  const semaine = numeroSemaine(lundi);
  const cle = `${semaine.annee}-${semaine.numero}`;
  document.querySelector("#libelle-semaine").textContent = `Semaine ${semaine.numero}`;
  document.querySelector("#dates-semaine").textContent = `${lundi.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${dimanche.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
  document.querySelector("#selection-semaine").checked = semainesChoisies.some((item) => item.cle === cle);
  document.querySelector("#semaines-choisies").innerHTML = semainesChoisies.map((item) => `<span class="semaine-choisie">S${item.numero} · ${item.debut} à ${item.fin}</span>`).join("");
}

function modifierSemaines(ajouter) {
  const lundi = lundiDeSemaine(semaineAffichee);
  const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
  const semaine = numeroSemaine(lundi);
  const cle = `${semaine.annee}-${semaine.numero}`;
  if (ajouter && !semainesChoisies.some((item) => item.cle === cle)) semainesChoisies.push({ cle, numero: semaine.numero, debut: lundi.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), fin: dimanche.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) });
  if (!ajouter) semainesChoisies = semainesChoisies.filter((item) => item.cle !== cle);
  afficherSemaine();
}

function afficherPlanningType() {
  const frequence = document.querySelector('input[name="frequence"]:checked').value;
  document.querySelector("#planning-unique").classList.toggle("cache", frequence !== "unique");
  document.querySelector("#planning-hebdomadaire").classList.toggle("cache", frequence !== "hebdomadaire");
  document.querySelector("#planning-mensuel").classList.toggle("cache", frequence !== "mensuel");
  afficherSemaine();
}

function remplirPlanning(patient) {
  semaineAffichee = new Date();
  semainesChoisies = structuredClone(patient.semaines || []);
  document.querySelectorAll('input[name="joursHebdomadaires"]').forEach((caseJour) => caseJour.checked = (patient.joursHebdomadaires || []).includes(caseJour.value));
  document.querySelectorAll('input[name="joursMensuels"]').forEach((caseJour) => caseJour.checked = (patient.joursMensuels || []).includes(caseJour.value));
  document.querySelectorAll('input[name="moisMensuels"]').forEach((caseMois) => caseMois.checked = (patient.moisMensuels || []).includes(caseMois.value));
  afficherPlanningType();
}

function valeursChoisies(nom) { return [...document.querySelectorAll(`input[name="${nom}"]:checked`)].map((caseJour) => caseJour.value); }

function lireContacts(type) {
  const zone = type === "urgence" ? "#contacts-urgence" : "#contacts-intervenants";
  return [...document.querySelectorAll(`${zone} .mini-contact`)].map((carte) => {
    const lire = (champ) => carte.querySelector(`[data-champ-contact="${champ}"]`)?.value.trim() || "";
    return { nom: lire("nom"), telephone: lire("telephone"), jour: lire("jour"), horaire: lire("horaire") };
  }).filter((contact) => contact.nom || contact.telephone);
}

function ouvrirFichePatient(id) {
  const patient = donnees.patients.find((item) => item.id === id);
  if (!patient) return;
  patientConsulte = id;
  const photo = patient.photo ? `<img src="${echapper(patient.photo)}" alt="Photo de ${echapper(patient.nom)}" />` : "●";
  const contacts = (patient.contactsUrgence || []).map((contact) => `<p><span class="libelle-fiche">${echapper(contact.nom || "Contact")}</span>${echapper(contact.telephone || "Téléphone non indiqué")}</p>`).join("") || "<p>Aucun contact indiqué.</p>";
  const intervenants = (patient.intervenants || []).map((contact) => `<p><span class="libelle-fiche">${echapper(contact.nom || "Intervenant")}</span>${echapper(contact.telephone || "Téléphone non indiqué")} ${contact.jour ? `· ${echapper(contact.jour)}${contact.horaire ? ` ${echapper(contact.horaire)}` : ""}` : ""}</p>`).join("") || "<p>Aucun intervenant indiqué.</p>";
  const pathologies = (patient.pathologies || []).map((item) => `<p><span class="libelle-fiche">${echapper(item.nom)}</span>${echapper(item.note || "Sans détail")}</p>`).join("") || "<p>Aucune pathologie indiquée.</p>";
  const planning = patient.frequence === "hebdomadaire"
    ? `Hebdomadaire · ${(patient.joursHebdomadaires || []).join(", ") || "Jours à définir"} · ${(patient.semaines || []).map((semaine) => `S${semaine.numero}`).join(", ") || "Semaines à définir"}`
    : patient.frequence === "mensuel"
      ? `Mensuel · ${(patient.joursMensuels || []).join(", ") || "Jours à définir"} · ${(patient.moisMensuels || []).join(", ") || "Mois à définir"}`
      : patient.dateVisite || "Date à définir";
  document.querySelector("#contenu-fiche-patient").innerHTML = `<section class="entete-fiche"><div class="photo-fiche">${photo}</div><div><h2>${echapper(patient.nom)}</h2><p>${echapper(patient.civilite || "")}</p></div></section>
    <article class="bloc-fiche"><h2>Pathologies</h2>${pathologies}</article>
    <article class="bloc-fiche"><h2>Note générale</h2><p>${echapper(patient.notes || "Aucune note.")}</p></article>
    <article class="bloc-fiche"><h2>Adresse</h2><p>${echapper(patient.adressePostale || "Non indiquée")}</p></article>
    <article class="bloc-fiche"><h2>Repérage</h2><p>${echapper(patient.localisation || "Non indiqué")}</p><p>${patient.latitude !== null && patient.latitude !== undefined ? `${patient.latitude}, ${patient.longitude}` : "Coordonnées à préciser."}</p></article>
    <article class="bloc-fiche"><h2>Planning</h2><p>${echapper(planning)} · ${echapper(patient.heureDebut || "--:--")} - ${echapper(patient.heureFin || "--:--")}</p></article>
    <article class="bloc-fiche"><h2>Contacts urgence</h2>${contacts}</article>
    <article class="bloc-fiche"><h2>Autres intervenants</h2>${intervenants}</article>
    <article class="bloc-fiche"><h2>Instruction vocale</h2><p>${echapper(patient.transcription || "Aucune transcription.")}</p></article>`;
  afficherVue("fiche-patient");
}

/* Photo patient */
function afficherPhoto() {
  const image = document.querySelector("#image-patient");
  const icone = document.querySelector("#icone-photo");
  image.src = photoPatient;
  image.classList.toggle("cache", !photoPatient);
  icone.classList.toggle("cache", Boolean(photoPatient));
}

function lirePhoto(fichier) {
  if (!fichier) return;
  if (!fichier.type.startsWith("image/")) { afficherMessage("Choisir un fichier image."); return; }
  if (fichier.size > 2 * 1024 * 1024) { afficherMessage("Choisir une photo de moins de 2 Mo."); return; }
  const lecteur = new FileReader();
  lecteur.onload = () => {
    photoPatient = lecteur.result;
    afficherPhoto();
    afficherMessage("Photo ajoutée à la fiche.");
  };
  lecteur.readAsDataURL(fichier);
}

function ouvrirConfirmation() {
  const valeurs = Object.fromEntries(new FormData(document.querySelector("#form-patient")).entries());
  const frequence = valeurs.frequence;
  const planningIncomplet = frequence === "unique" ? !valeurs.dateVisite : frequence === "hebdomadaire" ? !valeursChoisies("joursHebdomadaires").length || !semainesChoisies.length : !valeursChoisies("joursMensuels").length || !valeursChoisies("moisMensuels").length;
  const incomplet = [lireContacts("urgence").length, valeurs.heureDebut, valeurs.heureFin, planningIncomplet].some((valeur) => !valeur);
  document.querySelector("#texte-confirmation").textContent = incomplet
    ? "Attention, vous n'avez pas rempli tous les éléments utiles. Pour faciliter vos tournées ou celles de vos collègues, revenir compléter la fiche si nécessaire."
    : "Confirmer la sauvegarde de cette fiche patient.";
  document.querySelector("#modale-confirmation").classList.remove("cache");
}

function fermerConfirmation() {
  document.querySelector("#modale-confirmation").classList.add("cache");
}

function sauvegarderPatient() {
  const formulaire = document.querySelector("#form-patient");
  const donneesFormulaire = Object.fromEntries(new FormData(formulaire).entries());
  const position = verifierLocalisation();
  if (position.erreur) { fermerConfirmation(); afficherMessage("Vérifier la localisation du patient."); return; }
  const pathologies = lirePathologies();
  donnees.cataloguePathologies ||= [];
  pathologies.forEach((item) => { if (!donnees.cataloguePathologies.includes(item.nom)) donnees.cataloguePathologies.push(item.nom); });
  afficherCatalogue();
  const patient = { id: patientEnEdition || Date.now(), ...donneesFormulaire, photo: photoPatient, pathologies, contactsUrgence: lireContacts("urgence"), intervenants: lireContacts("intervenant"), semaines: structuredClone(semainesChoisies), joursHebdomadaires: valeursChoisies("joursHebdomadaires"), joursMensuels: valeursChoisies("joursMensuels"), moisMensuels: valeursChoisies("moisMensuels"), latitude: position.latitude ?? null, longitude: position.longitude ?? null };
  if (patientEnEdition) donnees.patients = donnees.patients.map((item) => item.id === patientEnEdition ? patient : item);
  else donnees.patients.push(patient);
  sauvegarderDonnees();
  fermerConfirmation();
  preparerNouveauPatient();
  afficherPatients(); afficherAccueil(); afficherPlanning();
  afficherVue("patients");
  const manquants = [patient.contactsUrgence.length, patient.pathologies.length, patient.heureDebut, patient.heureFin, patient.adressePostale].filter((valeur) => !valeur).length;
  if (manquants) afficherMessage("Fiche enregistrée. Des éléments utiles restent à compléter.");
  else afficherMessage("Fiche patient enregistrée.");
}

function afficherMessage(texte) {
  const zone = document.querySelector("#message");
  zone.textContent = texte;
  zone.classList.add("visible");
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => zone.classList.remove("visible"), 3200);
}

function ouvrirFormTournee() {
  const form = document.querySelector("#form-tournee");
  form.classList.remove("cache");
  document.querySelector("#liste-tournees").classList.add("cache");
  document.querySelectorAll("[data-onglet-tournees]").forEach((bouton) => {
    const actif = bouton.dataset.ongletTournees === "creation";
    bouton.classList.toggle("actif", actif);
    bouton.setAttribute("aria-selected", String(actif));
  });
  document.querySelector("#date-tournee").value = dateLocale();
  document.querySelector("#selection-tournee").innerHTML = donnees.patients.length ? donnees.patients.map((patient) => cartePatient(patient, true)).join("") : '<p class="aide">Ajouter un patient avant de créer une tournée.</p>';
}

function afficherListeTournees() {
  document.querySelector("#form-tournee").classList.add("cache");
  document.querySelector("#liste-tournees").classList.remove("cache");
  document.querySelectorAll("[data-onglet-tournees]").forEach((bouton) => {
    const actif = bouton.dataset.ongletTournees === "liste";
    bouton.classList.toggle("actif", actif);
    bouton.setAttribute("aria-selected", String(actif));
  });
  afficherTournees();
}

function creerTournee() {
  const nom = document.querySelector("#nom-tournee").value.trim();
  const date = document.querySelector("#date-tournee").value;
  const patientIds = [...document.querySelectorAll(".selection .selectionne")].map((element) => Number(element.dataset.patientId));
  if (!nom || !date || !patientIds.length) { afficherMessage("Compléter le nom, la date et les patients."); return; }
  donnees.tournees.push({ id: Date.now(), nom, date, patientIds });
  sauvegarderDonnees();
  document.querySelector("#nom-tournee").value = "";
  afficherListeTournees();
  afficherMessage("Tournée enregistrée.");
}

function exporterDonnees() {
  const fichier = new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" });
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(fichier);
  lien.download = "fyzirgo-donnees-test.json";
  lien.click();
  URL.revokeObjectURL(lien.href);
  afficherMessage("Fichier de données test exporté.");
}

function importerDonnees(fichier) {
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = () => {
    try {
      const importees = JSON.parse(lecteur.result);
      if (!Array.isArray(importees.patients) || !Array.isArray(importees.tournees)) throw new Error("format");
      donnees = importees;
      sauvegarderDonnees();
      afficherAccueil(); afficherPatients(); afficherTournees(); afficherPlanning();
      afficherMessage("Données test importées.");
    } catch { afficherMessage("Fichier non reconnu."); }
  };
  lecteur.readAsText(fichier);
}

document.addEventListener("click", (evenement) => {
  const cible = evenement.target.closest("[data-view]");
  if (cible) {
    if (cible.dataset.view === "nouveau-patient") preparerNouveauPatient();
    afficherVue(cible.dataset.view);
  }
  const action = evenement.target.closest("[data-action]");
  if (action?.dataset.action === "nouvelle-tournee") ouvrirFormTournee();
  if (action?.dataset.action === "afficher-liste-tournees" || action?.dataset.action === "annuler-tournee") afficherListeTournees();
  if (action?.dataset.action === "enregistrer-tournee") creerTournee();
  if (action?.dataset.action === "fermer-confirmation") fermerConfirmation();
  if (action?.dataset.action === "ajouter-contact-urgence") ajouterContact("urgence");
  if (action?.dataset.action === "ajouter-intervenant") ajouterContact("intervenant");
  if (action?.dataset.action === "supprimer-contact") { action.closest(".mini-contact").remove(); actualiserContacts(); }
  if (action?.dataset.action === "ajouter-pathologie") ajouterPathologie();
  if (action?.dataset.action === "details-pathologie") action.closest(".mini-pathologie").querySelector(".detail-pathologie").classList.toggle("cache");
  if (action?.dataset.action === "editer-pathologie") {
    const champ = action.closest(".mini-pathologie").querySelector("[data-pathologie=nom]");
    champ.readOnly = !champ.readOnly;
    action.textContent = champ.readOnly ? "Éditer" : "Valider";
    if (!champ.readOnly) champ.focus();
  }
  if (action?.dataset.action === "supprimer-pathologie") { action.closest(".mini-pathologie").remove(); actualiserPathologies(); }
  if (action?.dataset.action === "semaine-precedente") { semaineAffichee.setDate(semaineAffichee.getDate() - 7); afficherSemaine(); }
  if (action?.dataset.action === "semaine-suivante") { semaineAffichee.setDate(semaineAffichee.getDate() + 7); afficherSemaine(); }
  if (action?.dataset.action === "activer-tournee") activerTournee(Number(action.dataset.tourneeId));
  if (action?.dataset.action === "ouvrir-langues") document.querySelector("#menu-langue").classList.toggle("cache");
  if (action?.dataset.action === "choisir-langue") {
    document.querySelector(".code-langue").textContent = action.dataset.langue;
    document.querySelector("#menu-langue").classList.add("cache");
  }
  const patient = evenement.target.closest(".selection .selectionnable");
  if (patient) patient.classList.toggle("selectionne");
  const carte = evenement.target.closest(".carte-patient.ouvrable");
  if (carte && !evenement.target.closest(".selection")) ouvrirFichePatient(Number(carte.dataset.patientId));
});

document.querySelector("#recherche-patient").addEventListener("input", afficherPatients);
document.querySelectorAll(".filtre").forEach((bouton) => bouton.addEventListener("click", () => {
  filtreActif = bouton.dataset.filtre;
  document.querySelectorAll(".filtre").forEach((item) => item.classList.toggle("actif", item === bouton));
  afficherPatients();
}));
document.querySelector("#localisation").addEventListener("input", verifierLocalisation);
document.querySelector("#rechercher-adresse").addEventListener("click", rechercherAdresse);
document.querySelector("#coller-lien-maps").addEventListener("click", collerLienMaps);
document.querySelector("#form-patient").addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  const position = verifierLocalisation();
  if (position.erreur) { afficherMessage("Vérifier la localisation du patient."); return; }
  ouvrirConfirmation();
});
document.querySelector("#confirmer-sauvegarde").addEventListener("click", sauvegarderPatient);
document.querySelector("#editer-fiche-patient").addEventListener("click", () => ouvrirPatient(patientConsulte));
document.querySelector("#ouvrir-prochain-patient").addEventListener("click", () => {
  if (prochainPatientId) ouvrirFichePatient(prochainPatientId);
});
document.querySelector("#ouvrir-tournee-active").addEventListener("click", () => afficherVue("tournees"));
document.querySelector("#selection-semaine").addEventListener("change", (evenement) => modifierSemaines(evenement.target.checked));
document.querySelectorAll('input[name="frequence"]').forEach((bouton) => bouton.addEventListener("change", afficherPlanningType));
document.querySelector("#enregistrer-voix").addEventListener("click", () => afficherMessage("Fonction non disponible dans cette version."));
document.querySelector("#transcrire-voix").addEventListener("click", () => afficherMessage("Aucun message vocal à transcrire."));
document.querySelector("#ecouter-voix").addEventListener("click", () => afficherMessage("Aucune note sauvegardée."));
document.querySelector("#ouvrir-appareil-photo").addEventListener("click", () => document.querySelector("#photo-appareil").click());
document.querySelector("#ouvrir-fichier-photo").addEventListener("click", () => document.querySelector("#photo-fichier").click());
document.querySelector("#photo-appareil").addEventListener("change", (evenement) => lirePhoto(evenement.target.files[0]));
document.querySelector("#photo-fichier").addEventListener("change", (evenement) => lirePhoto(evenement.target.files[0]));
document.querySelector("#form-creation-compte").addEventListener("submit", creerCompte);
document.querySelector("#form-connexion-compte").addEventListener("submit", connecterCompte);

/* Don fictif */
let montantDon = 5;
function afficherEtapeDon(paiement = false) {
  document.querySelector("#etape-montant-don").classList.toggle("cache", paiement);
  document.querySelector("#etape-paiement-don").classList.toggle("cache", !paiement);
  document.querySelector("#montant-paiement").textContent = `${montantDon} €`;
}
document.querySelector("#ouvrir-don").addEventListener("click", () => {
  afficherEtapeDon(false);
  document.querySelector("#modale-don").classList.remove("cache");
});
document.querySelector("#montants-don").addEventListener("click", (evenement) => {
  const bouton = evenement.target.closest("[data-montant]");
  if (!bouton) return;
  montantDon = Number(bouton.dataset.montant);
  document.querySelectorAll("#montants-don button").forEach((item) => item.classList.toggle("actif", item === bouton));
});
document.querySelector("#confirmer-don").addEventListener("click", () => {
  afficherEtapeDon(true);
});
document.querySelector("#retour-don").addEventListener("click", () => afficherEtapeDon(false));
document.querySelector("#simuler-don").addEventListener("click", () => {
  document.querySelector("#modale-don").classList.add("cache");
  afficherMessage(`Démonstration uniquement : don de ${montantDon} €. Aucun débit effectué.`);
});
document.querySelectorAll('[data-action="fermer-don"]').forEach((bouton) => bouton.addEventListener("click", () => document.querySelector("#modale-don").classList.add("cache")));

/* Compte utilisateur */
async function creerCompte(evenement) {
  evenement.preventDefault();
  const valeurs = Object.fromEntries(new FormData(evenement.currentTarget).entries());
  try {
    const reponse = await fetch("/api/comptes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valeurs) });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.message);
    document.querySelector("#etat-compte").textContent = `Compte créé : ${resultat.email}.`;
    evenement.currentTarget.reset();
    afficherMessage("Compte créé.");
  } catch (erreur) {
    afficherMessage(erreur.message || "Démarrer le serveur et la base MySQL.");
  }
}

async function connecterCompte(evenement) {
  evenement.preventDefault();
  const valeurs = Object.fromEntries(new FormData(evenement.currentTarget).entries());
  try {
    const reponse = await fetch("/api/connexions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valeurs) });
    const resultat = await reponse.json();
    if (!reponse.ok) throw new Error(resultat.message);
    localStorage.setItem("fyzirgo-compte", JSON.stringify(resultat));
    document.querySelector("#role-utilisateur").value = resultat.role;
    document.querySelector("#etat-compte").textContent = `Session ouverte : ${resultat.nom}.`;
    afficherMessage("Session ouverte.");
  } catch (erreur) {
    afficherMessage(erreur.message || "Démarrer le serveur et la base MySQL.");
  }
}
document.querySelector("#exporter-donnees").addEventListener("click", exporterDonnees);
document.querySelector("#importer-donnees").addEventListener("change", (evenement) => importerDonnees(evenement.target.files[0]));

actualiserHorloge();
setInterval(actualiserHorloge, 30000);
async function initialiserApplication() {
  donnees = await chargerDonnees();
  donnees.cataloguePathologies ||= [];
  donnees.patients.forEach((patient) => {
    if (!patient.pathologies && patient.pathologie) patient.pathologies = [{ nom: patient.pathologie, note: "" }];
    (patient.pathologies || []).forEach((item) => {
      if (item.nom && !donnees.cataloguePathologies.includes(item.nom)) donnees.cataloguePathologies.push(item.nom);
    });
  });
  genererCreneaux();
  genererChoixPlanning();
  afficherCatalogue();
  afficherAccueil();
  afficherPatients();
  afficherTournees();
  afficherPlanning();
}

initialiserApplication();

/* Installation PWA */
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
