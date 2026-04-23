import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, description } = await req.json();

    // Use keyword-based classification for the image URL and description
    const issueTypes = ['pothole', 'garbage', 'broken_streetlight', 'water_leak', 'road_damage'];
    const keywords: Record<string, string[]> = {
      pothole: ['pothole', 'hole', 'pit', 'crack', 'road damage', 'bumpy'],
      garbage: ['garbage', 'trash', 'waste', 'dump', 'overflow', 'rubbish', 'litter'],
      broken_streetlight: ['streetlight', 'light', 'lamp', 'dark', 'broken light', 'no light'],
      water_leak: ['water', 'leak', 'pipe', 'flooding', 'wet', 'burst', 'drain'],
      road_damage: ['road', 'damage', 'crack', 'broken road', 'surface', 'asphalt'],
    };

    const descLower = (description || '').toLowerCase();
    let bestMatch = 'other';
    let bestScore = 0;

    for (const [type, words] of Object.entries(keywords)) {
      const score = words.filter(w => descLower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = type;
      }
    }

    const confidence = bestScore > 0 ? Math.min(0.95, 0.6 + bestScore * 0.1) : 0.4;

    // Analyze urgency from text
    const urgencyKeywords = {
      critical: ['danger', 'emergency', 'accident', 'fatal', 'collapse', 'flood'],
      high: ['urgent', 'hazard', 'unsafe', 'broken', 'severe', 'risk', 'immediate'],
      medium: ['damaged', 'problem', 'issue', 'moderate', 'needs repair'],
      low: ['minor', 'small', 'cosmetic', 'slight'],
    };

    let urgency = 'medium';
    for (const [level, words] of Object.entries(urgencyKeywords)) {
      if (words.some(w => descLower.includes(w))) {
        urgency = level;
        break;
      }
    }

    // Extract keywords
    const extractedKeywords = descLower
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    // Sentiment analysis
    const negativeWords = ['broken', 'dangerous', 'terrible', 'worst', 'horrible', 'bad', 'unsafe'];
    const negCount = negativeWords.filter(w => descLower.includes(w)).length;
    const sentiment = negCount >= 2 ? 'very_negative' : negCount === 1 ? 'negative' : 'neutral';

    return new Response(
      JSON.stringify({
        classification: {
          issue_type: bestMatch,
          confidence,
        },
        analysis: {
          urgency,
          sentiment,
          keywords: extractedKeywords,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
