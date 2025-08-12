import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

interface FamilyMember {
  id: number;
  meno_raw: string;
  meno_clean: string;
  gender: string;
  katastralne_uzemie: string;
  lv: number;
  poradie: number;
  tags: Array<{
    key: string;
    value: string;
    uncertain: boolean;
  }>;
}

interface FamilyRelation {
  lvGroup: {
    katastralne_uzemie: string;
    lv: number;
    memberCount: number;
  };
  members: FamilyMember[];
  detectedRelations: Array<{
    person1: number;
    person2: number;
    relation: string;
    confidence: number;
    evidence: string[];
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const { sourceId } = await request.json();
    
    if (!sourceId) {
      return NextResponse.json(
        { error: 'Source ID je povinný' },
        { status: 400 }
      );
    }

    // Demo data pre Source ID 999
    if (sourceId === 999) {
      return NextResponse.json({
        sourceId: 999,
        totalLvGroups: 2,
        familyRelations: [
          {
            lvGroup: {
              katastralne_uzemie: "Bratislava",
              lv: 1001,
              memberCount: 4,
              poradoveCisla: [1, 2, 3, 4]
            },
            members: [
              { id: 1, meno_raw: "Novák Ján, (manž. Mária r. Svobodová)", gender: "muž", poradie: 1, tags: [
                { key: "krstné_meno", value: "Ján", uncertain: false },
                { key: "priezvisko", value: "Novák", uncertain: false },
                { key: "manželka", value: "Mária Nováková", uncertain: false }
              ]},
              { id: 2, meno_raw: "Nováková Mária r. Svobodová", gender: "žena", poradie: 2, tags: [
                { key: "krstné_meno", value: "Mária", uncertain: false },
                { key: "priezvisko", value: "Nováková", uncertain: false },
                { key: "rodné_priezvisko", value: "Svobodová", uncertain: false }
              ]},
              { id: 3, meno_raw: "Novák Peter (syn Ján a Mária)", gender: "muž", poradie: 3, tags: [
                { key: "krstné_meno", value: "Peter", uncertain: false },
                { key: "priezvisko", value: "Novák", uncertain: false },
                { key: "otec", value: "Ján", uncertain: false }
              ]},
              { id: 4, meno_raw: "Nováková Anna (dcéra Ján a Mária)", gender: "žena", poradie: 4, tags: [
                { key: "krstné_meno", value: "Anna", uncertain: false },
                { key: "priezvisko", value: "Nováková", uncertain: false },
                { key: "otec", value: "Ján", uncertain: false }
              ]}
            ],
            detectedRelations: [
              { person1: 1, person2: 2, relation: "manželia", confidence: 0.9, evidence: ["Novák Ján má tag manželka: \"Mária Nováková\" ktorý obsahuje \"Mária\""] },
              { person1: 1, person2: 3, relation: "rodič-dieťa", confidence: 0.85, evidence: ["Novák Peter má tag otec: \"Ján\" ktorý obsahuje \"Ján\""] },
              { person1: 1, person2: 4, relation: "rodič-dieťa", confidence: 0.85, evidence: ["Nováková Anna má tag otec: \"Ján\" ktorý obsahuje \"Ján\""] },
              { person1: 2, person2: 3, relation: "rodič-dieťa", confidence: 0.80, evidence: ["Rovnaké priezvisko po vydaji"] },
              { person1: 2, person2: 4, relation: "rodič-dieťa", confidence: 0.80, evidence: ["Rovnaké priezvisko po vydaji"] },
              { person1: 3, person2: 4, relation: "súrodenci", confidence: 0.75, evidence: ["Rovnaký otec v tagoch"] }
            ]
          },
          {
            lvGroup: {
              katastralne_uzemie: "Košice",
              lv: 2002,
              memberCount: 3,
              poradoveCisla: [1, 2, 5]
            },
            members: [
              { id: 5, meno_raw: "Kováč Peter, (manž. Elena r. Horváth)", gender: "muž", poradie: 1, tags: [
                { key: "krstné_meno", value: "Peter", uncertain: false },
                { key: "priezvisko", value: "Kováč", uncertain: false },
                { key: "manželka", value: "Elena Kováčová", uncertain: false }
              ]},
              { id: 6, meno_raw: "Kováčová Elena r. Horváth", gender: "žena", poradie: 2, tags: [
                { key: "krstné_meno", value: "Elena", uncertain: false },
                { key: "priezvisko", value: "Kováčová", uncertain: false },
                { key: "rodné_priezvisko", value: "Horváth", uncertain: false }
              ]},
              { id: 7, meno_raw: "Kováč Michal (syn Peter)", gender: "muž", poradie: 5, tags: [
                { key: "krstné_meno", value: "Michal", uncertain: false },
                { key: "priezvisko", value: "Kováč", uncertain: false },
                { key: "otec", value: "Peter", uncertain: false }
              ]}
            ],
            detectedRelations: [
              { person1: 5, person2: 6, relation: "manželia", confidence: 0.9, evidence: ["Kováč Peter má tag manželka: \"Elena Kováčová\" ktorý obsahuje \"Elena\""] },
              { person1: 5, person2: 7, relation: "rodič-dieťa", confidence: 0.85, evidence: ["Kováč Michal má tag otec: \"Peter\" ktorý obsahuje \"Peter\""] },
              { person1: 6, person2: 7, relation: "rodič-dieťa", confidence: 0.80, evidence: ["Rovnaké priezvisko po vydaji"] }
            ]
          }
        ]
      });
    }

    const client = await pool.connect();
    
    try {
      // Získaj všetky záznamy pre daný source zoskupené podľa katastrálneho územia a LV
      // Poradové čísla môžu byť rôzne (rôzni spoluvlastníci)
      const lvGroupsQuery = `
        SELECT 
          katastralne_uzemie,
          lv,
          COUNT(*) as member_count,
          array_agg(poradie ORDER BY poradie) as poradove_cisla
        FROM owners 
        WHERE source_id = $1 
        GROUP BY katastralne_uzemie, lv 
        HAVING COUNT(*) > 1
        ORDER BY member_count DESC, katastralne_uzemie, lv
        LIMIT 50
      `;
      
      const lvGroupsResult = await client.query(lvGroupsQuery, [sourceId]);
      const familyRelations: FamilyRelation[] = [];

      for (const lvGroup of lvGroupsResult.rows) {
        // Získaj všetkých členov tejto LV skupiny
        const membersQuery = `
          SELECT 
            o.id,
            o.meno_raw,
            o.meno_clean,
            o.gender,
            o.katastralne_uzemie,
            o.lv,
            o.poradie,
            array_agg(
              json_build_object(
                'key', ot.key,
                'value', ot.value,
                'uncertain', ot.uncertain
              )
            ) FILTER (WHERE ot.id IS NOT NULL) as tags
          FROM owners o
          LEFT JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE o.source_id = $1 
            AND o.katastralne_uzemie = $2 
            AND o.lv = $3
          GROUP BY o.id, o.meno_raw, o.meno_clean, o.gender, o.katastralne_uzemie, o.lv, o.poradie
          ORDER BY o.poradie
        `;
        
        const membersResult = await client.query(membersQuery, [
          sourceId, 
          lvGroup.katastralne_uzemie, 
          lvGroup.lv
        ]);

        const members: FamilyMember[] = membersResult.rows.map(row => ({
          id: row.id,
          meno_raw: row.meno_raw,
          meno_clean: row.meno_clean,
          gender: row.gender,
          katastralne_uzemie: row.katastralne_uzemie,
          lv: row.lv,
          poradie: row.poradie,
          tags: row.tags || []
        }));

        // Analyzuj rodinné väzby v tejto skupine
        const detectedRelations = analyzeFamily(members);

        familyRelations.push({
          lvGroup: {
            katastralne_uzemie: lvGroup.katastralne_uzemie,
            lv: lvGroup.lv,
            memberCount: lvGroup.member_count,
            poradoveCisla: lvGroup.poradove_cisla
          },
          members,
          detectedRelations
        });
      }

      return NextResponse.json({
        sourceId,
        totalLvGroups: lvGroupsResult.rows.length,
        familyRelations
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Family relations analysis error:', error);
    return NextResponse.json(
      { error: 'Chyba pri analýze rodinných väzieb' },
      { status: 500 }
    );
  }
}

// Hlavná funkcia pre analýzu rodinných väzieb
function analyzeFamily(members: FamilyMember[]): Array<{
  person1: number;
  person2: number;
  relation: string;
  confidence: number;
  evidence: string[];
}> {
  const relations: Array<{
    person1: number;
    person2: number;
    relation: string;
    confidence: number;
    evidence: string[];
  }> = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const person1 = members[i];
      const person2 = members[j];
      
      const relation = detectRelation(person1, person2);
      if (relation) {
        relations.push({
          person1: person1.id,
          person2: person2.id,
          relation: relation.type,
          confidence: relation.confidence,
          evidence: relation.evidence
        });
      }
    }
  }

  return relations;
}

// Detekcia konkrétneho vzťahu medzi dvoma osobami
function detectRelation(person1: FamilyMember, person2: FamilyMember): {
  type: string;
  confidence: number;
  evidence: string[];
} | null {
  const evidence: string[] = [];
  let confidence = 0.1; // základná confidence pre rovnaké LV
  
  // Získaj tagy pre analýzu
  const person1Tags = new Map<string, string>();
  const person2Tags = new Map<string, string>();
  
  person1.tags.forEach(tag => person1Tags.set(tag.key, tag.value));
  person2.tags.forEach(tag => person2Tags.set(tag.key, tag.value));

  // 1. Manžel a manželka
  const person1SpouseTag = person1Tags.get('manželka') || person1Tags.get('manžel');
  const person2SpouseTag = person2Tags.get('manželka') || person2Tags.get('manžel');
  
  if (person1SpouseTag || person2SpouseTag) {
    const person1Given = person1Tags.get('krstné_meno') || '';
    const person2Given = person2Tags.get('krstné_meno') || '';
    
    // Ak manželka/manžel obsahuje meno druhej osoby
    if (person1SpouseTag && person1SpouseTag.includes(person2Given)) {
      confidence = 0.9;
      evidence.push(`${person1.meno_raw} má tag manželka/manžel: "${person1SpouseTag}" ktorý obsahuje "${person2Given}"`);
      return { type: 'manželia', confidence, evidence };
    }
    
    if (person2SpouseTag && person2SpouseTag.includes(person1Given)) {
      confidence = 0.9;
      evidence.push(`${person2.meno_raw} má tag manželka/manžel: "${person2SpouseTag}" ktorý obsahuje "${person1Given}"`);
      return { type: 'manželia', confidence, evidence };
    }
  }

  // 2. Rodič a dieťa na základe tagov syn/dcéra
  const person1FamilyTags = ['syn', 'dcéra', 'otec', 'matka'].filter(tag => person1Tags.has(tag));
  const person2FamilyTags = ['syn', 'dcéra', 'otec', 'matka'].filter(tag => person2Tags.has(tag));
  
  if (person1FamilyTags.length > 0 || person2FamilyTags.length > 0) {
    for (const tag1 of person1FamilyTags) {
      const tagValue = person1Tags.get(tag1) || '';
      const person2Given = person2Tags.get('krstné_meno') || '';
      
      if (tagValue.includes(person2Given)) {
        confidence = 0.85;
        evidence.push(`${person1.meno_raw} má tag ${tag1}: "${tagValue}" ktorý obsahuje "${person2Given}"`);
        
        if (tag1 === 'syn' || tag1 === 'dcéra') {
          return { type: 'rodič-dieťa', confidence, evidence };
        } else if (tag1 === 'otec' || tag1 === 'matka') {
          return { type: 'dieťa-rodič', confidence, evidence };
        }
      }
    }
  }

  // 3. Súrodenci - rovnaké priezvisko, rôzne pohlavie/mená
  const person1Surname = person1Tags.get('priezvisko') || '';
  const person2Surname = person2Tags.get('priezvisko') || '';
  
  if (person1Surname && person2Surname && 
      person1Surname.toLowerCase() === person2Surname.toLowerCase() &&
      person1.gender !== person2.gender) {
    
    confidence = 0.6;
    evidence.push(`Rovnaké priezvisko: "${person1Surname}" a rôzne pohlavie`);
    return { type: 'súrodenci', confidence, evidence };
  }

  // 4. Príbuzní - podobné priezviská alebo rodné priezviská
  const person1MaidenSurname = person1Tags.get('rodné_priezvisko') || '';
  const person2MaidenSurname = person2Tags.get('rodné_priezvisko') || '';
  
  if (person1MaidenSurname && person2MaidenSurname &&
      person1MaidenSurname.toLowerCase() === person2MaidenSurname.toLowerCase()) {
    
    confidence = 0.5;
    evidence.push(`Rovnaké rodné priezvisko: "${person1MaidenSurname}"`);
    return { type: 'príbuzní', confidence, evidence };
  }

  // 5. Základný vzťah - rovnaké LV
  if (confidence === 0.1) {
    evidence.push(`Rovnaké LV: ${person1.lv} v ${person1.katastralne_uzemie}`);
    return { type: 'spoluvlastníci', confidence, evidence };
  }

  return null;
}
