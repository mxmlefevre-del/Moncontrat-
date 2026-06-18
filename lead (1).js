// ============================================================
//  api/lead.js — CAPTURE DE LEAD de MonContrat.app
//  Enregistre les coordonnées d'un utilisateur (+ consentement
//  horodaté, preuve RGPD) dans la table "profiles" de Supabase
//  quand il active le service "Trouvez moins cher".
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // clé secrète, dans Vercel

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Configuration serveur incomplète." });
  }

  try {
    const { full_name, email, phone, consent_partner, contract_type, ri_base64, ri_filename, project_description } = req.body || {};

    // Validations minimales
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Email invalide." });
    }
    if (!consent_partner) {
      return res.status(400).json({ error: "Le consentement est requis pour transmettre votre dossier." });
    }

    const consentText = "L'utilisateur a accepté la transmission de son dossier aux assureurs partenaires via le service « Trouvez moins cher » (page d'analyse).";

    // Si un relevé d'information (PDF) est joint, on le stocke dans le bucket "contracts"
    let ri_path = null;
    if (ri_base64) {
      try {
        const safeName = (ri_filename || 'releve.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectPath = `releves/${Date.now()}_${safeName}`;
        const pdfBuffer = Buffer.from(ri_base64, 'base64');
        const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/contracts/${objectPath}`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/pdf'
          },
          body: pdfBuffer
        });
        if (upRes.ok) {
          ri_path = objectPath;
        } else {
          console.error('Upload RI échoué:', upRes.status, await upRes.text());
          // on continue quand même : le RI est optionnel
        }
      } catch (e) {
        console.error('Erreur upload RI:', e);
      }
    }

    // Insertion dans Supabase via l'API REST
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        full_name: full_name || null,
        email,
        phone: phone || null,
        consent_partner: true,
        consent_partner_at: new Date().toISOString(),
        consent_text: consentText,
        contract_type: contract_type || null,
        project_description: project_description || null,
        releve_path: ri_path
      })
    });

    if (!insertRes.ok) {
      const errTxt = await insertRes.text();
      console.error('Erreur Supabase lead:', insertRes.status, errTxt);
      return res.status(502).json({ error: "Impossible d'enregistrer votre demande. Réessayez." });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Erreur lead:', err);
    return res.status(500).json({ error: "Une erreur est survenue." });
  }
}
