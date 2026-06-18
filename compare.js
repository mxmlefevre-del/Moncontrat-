// ============================================================
//  api/compare.js — MOTEUR DU COMPARATEUR
//  Reçoit deux PDF (base64) + le ton, demande à l'IA de vérifier
//  puis comparer, et renvoie soit un cas d'erreur, soit la
//  comparaison structurée.
// ============================================================

import { SYSTEM_COMPARE } from './_prompt-compare.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4000;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Configuration serveur incomplète (clé API manquante)." });
  }

  try {
    const { pdf_a, pdf_b, ton } = req.body || {};
    if (!pdf_a || !pdf_b) {
      return res.status(400).json({ error: "Deux contrats sont nécessaires." });
    }

    const dateDuJour = new Date().toLocaleDateString('fr-FR');
    const systemPrompt = SYSTEM_COMPARE
      .replaceAll('{{TON}}', ton || 'Classique')
      .replaceAll('{{DATE_DU_JOUR}}', dateDuJour);

    const apiRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Voici le Contrat A :' },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_a } },
            { type: 'text', text: 'Voici le Contrat B :' },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_b } },
            { type: 'text', text: 'Vérifie d\'abord la validité et la compatibilité, puis compare selon le format JSON demandé.' }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const errTxt = await apiRes.text();
      console.error('Anthropic error:', apiRes.status, errTxt);
      return res.status(502).json({ error: "Le comparateur est momentanément indisponible. Réessayez dans un instant." });
    }

    const data = await apiRes.json();
    let raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('JSON parse error:', e, raw.slice(0, 400));
      return res.status(502).json({ error: "La réponse n'a pas pu être lue. Réessayez." });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    // Cas d'erreur métier renvoyé par l'IA
    if (parsed.cas) {
      return res.status(200).json({ cas: parsed.cas, type_a: parsed.type_a || null, type_b: parsed.type_b || null });
    }

    // Comparaison réussie
    return res.status(200).json({ ok: true, comparison: parsed });

  } catch (err) {
    console.error('Erreur compare.js:', err);
    return res.status(500).json({ error: "Une erreur est survenue. Réessayez dans un instant." });
  }
}
