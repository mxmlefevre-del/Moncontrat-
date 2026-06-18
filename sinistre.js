// ============================================================
//  api/sinistre.js — MOTEUR DU CHAT "Assistant sinistre"
//  Reçoit l'historique de la conversation, l'envoie à l'IA
//  Anthropic avec le prompt système expert, renvoie la réponse.
// ============================================================

import { SYSTEM_SINISTRE } from './_prompt-sinistre.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

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
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Aucun message fourni." });
    }

    // On ne garde que les champs utiles et on borne l'historique (sécurité/coût)
    const cleaned = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "Messages invalides." });
    }

    const dateDuJour = new Date().toLocaleDateString('fr-FR');
    const systemPrompt = SYSTEM_SINISTRE.replaceAll('{{DATE_DU_JOUR}}', dateDuJour);

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
        messages: cleaned
      })
    });

    if (!apiRes.ok) {
      const errTxt = await apiRes.text();
      console.error('Anthropic error:', apiRes.status, errTxt);
      return res.status(502).json({ error: "L'assistant est momentanément indisponible. Réessayez dans un instant." });
    }

    const data = await apiRes.json();
    const reply = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!reply) {
      return res.status(502).json({ error: "Réponse vide de l'assistant. Réessayez." });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ ok: true, reply });

  } catch (err) {
    console.error('Erreur sinistre.js:', err);
    return res.status(500).json({ error: "Une erreur est survenue. Réessayez dans un instant." });
  }
}
