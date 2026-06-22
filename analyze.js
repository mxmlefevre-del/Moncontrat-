// ============================================================
//  api/analyze.js — MOTEUR D'ANALYSE de MonContrat.app
//  Version streaming — évite le timeout Vercel 60s
// ============================================================

import { SYSTEM_PROMPT } from './_prompt.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4000;

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  // -- CORS --
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Clé API manquante." });

  try {
    const { texte, ton } = req.body || {};
    if (!texte) return res.status(400).json({ error: "Aucun texte fourni." });

    const tonChoisi = ton || 'Classique';
    const dateDuJour = new Date().toLocaleDateString('fr-FR');

    const systemPrompt = SYSTEM_PROMPT
      .replaceAll('{{TON}}', tonChoisi)
      .replaceAll('{{DATE_DU_JOUR}}', dateDuJour);

    const userContent = [
      { type: 'text', text: "Analyse ce contrat d'assurance selon tes consignes. Réponds uniquement avec le JSON.\n\nContenu du contrat :\n\n" + texte }
    ];

    // Appel Anthropic en streaming
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!anthropicRes.ok) {
      const errTxt = await anthropicRes.text();
      console.error('Erreur Anthropic:', anthropicRes.status, errTxt);
      return res.status(502).json({ error: "L'IA a retourné une erreur. Réessayez." });
    }

    // Lire le stream et accumuler le texte
    const reader = anthropicRes.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // garder la ligne incomplète

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            fullText += evt.delta.text;
          }
        } catch {}
      }
    }

    // Parser le JSON reçu
    const cleaned = fullText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON non parsable:', cleaned.slice(0, 500));
      return res.status(502).json({ error: "Résultat dans un format inattendu. Réessayez." });
    }

    return res.status(200).json({ ok: true, analysis });

  } catch (err) {
    console.error('Erreur analyze:', err);
    return res.status(500).json({ error: "Erreur serveur. Réessayez." });
  }
}
