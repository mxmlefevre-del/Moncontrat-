// ============================================================
//  api/analyze.js — MOTEUR D'ANALYSE de MonContrat.app
//  Reçoit un contrat (PDF en base64 ou texte), l'envoie à l'IA
//  Anthropic avec le prompt métier, renvoie un JSON structuré
//  prêt à afficher sur la page résultat.
// ============================================================

import { SYSTEM_PROMPT } from './_prompt.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';        // modèle équilibré (qualité/prix)
const MAX_TOKENS = 4000;
export const config = {
  maxDuration: 60
};
export default async function handler(req, res) {
  // -- CORS / méthode --
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  // -- Clé API (stockée dans Vercel, jamais dans le code) --
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Configuration serveur incomplète (clé API manquante)." });
  }

  try {
    const { pdf_base64, texte, ton } = req.body || {};
    const tonChoisi = (ton || 'Classique');
    const dateDuJour = new Date().toLocaleDateString('fr-FR');

    // Construire le prompt système avec les variables remplacées
    const systemPrompt = SYSTEM_PROMPT
      .replaceAll('{{TON}}', tonChoisi)
      .replaceAll('{{DATE_DU_JOUR}}', dateDuJour);

    // Construire le message utilisateur : soit le PDF, soit du texte
    let userContent;
    if (pdf_base64) {
      userContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 }
        },
        { type: 'text', text: "Analyse ce contrat d'assurance selon tes consignes. Réponds uniquement avec le JSON." }
      ];
    } else if (texte) {
      userContent = [
        { type: 'text', text: "Analyse ce contrat d'assurance selon tes consignes. Réponds uniquement avec le JSON.\n\nContenu du contrat :\n\n" + texte }
      ];
    } else {
      return res.status(400).json({ error: "Aucun contrat fourni (ni PDF ni texte)." });
    }

    // -- Appel à l'API Anthropic --
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
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!anthropicRes.ok) {
      const errTxt = await anthropicRes.text();
      console.error('Erreur Anthropic:', anthropicRes.status, errTxt);
      return res.status(502).json({ error: "L'analyse a échoué côté IA. Réessayez dans un instant." });
    }

    const data = await anthropicRes.json();

    // Extraire le texte de la réponse
    const rawText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    // Parser le JSON (en retirant d'éventuels ```json ... ``` de sécurité)
    let analysis;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON non parsable:', rawText.slice(0, 500));
      return res.status(502).json({ error: "Le résultat de l'analyse est arrivé dans un format inattendu. Réessayez." });
    }

    // Succès : renvoyer l'analyse structurée
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ ok: true, analysis });

  } catch (err) {
    console.error('Erreur analyze:', err);
    return res.status(500).json({ error: "Une erreur est survenue pendant l'analyse." });
  }
}
