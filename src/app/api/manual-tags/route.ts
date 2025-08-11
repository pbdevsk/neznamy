import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// GET - získať manuálne tagy pre záznam
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('owner_id');

    if (!ownerId) {
      return NextResponse.json(
        { error: 'owner_id je povinný parameter' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT id, tag_key, tag_value, is_locked, created_at, updated_at, created_by 
         FROM manual_tags 
         WHERE owner_id = $1 
         ORDER BY created_at ASC`,
        [parseInt(ownerId)]
      );

      return NextResponse.json(result.rows);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Manual tags GET error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní tagov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

// POST - pridať nový manuálny tag
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner_id, tag_key, tag_value, is_locked = false, created_by = 'user' } = body;

    if (!owner_id || !tag_key || !tag_value) {
      return NextResponse.json(
        { error: 'owner_id, tag_key a tag_value sú povinné' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      // Kontrola či owner existuje
      const ownerCheck = await client.query(
        'SELECT id FROM owners WHERE id = $1',
        [owner_id]
      );

      if (ownerCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'Záznam s týmto ID neexistuje' },
          { status: 404 }
        );
      }

      // Vloženie nového tagu (ON CONFLICT UPDATE pre prípad duplicity)
      const result = await client.query(
        `INSERT INTO manual_tags (owner_id, tag_key, tag_value, is_locked, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (owner_id, tag_key) 
         DO UPDATE SET 
           tag_value = EXCLUDED.tag_value,
           is_locked = EXCLUDED.is_locked,
           updated_at = CURRENT_TIMESTAMP,
           created_by = EXCLUDED.created_by
         RETURNING *`,
        [owner_id, tag_key, tag_value, is_locked, created_by]
      );

      return NextResponse.json(result.rows[0], { status: 201 });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Manual tags POST error:', error);
    return NextResponse.json(
      { error: 'Chyba pri vytváraní tagu', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

// DELETE - vymazať manuálny tag
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tag_id');

    if (!tagId) {
      return NextResponse.json(
        { error: 'tag_id je povinný parameter' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      const result = await client.query(
        'DELETE FROM manual_tags WHERE id = $1 RETURNING *',
        [parseInt(tagId)]
      );

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Tag nenájdený' },
          { status: 404 }
        );
      }

      return NextResponse.json({ 
        message: 'Tag úspešne vymazaný',
        deleted_tag: result.rows[0]
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Manual tags DELETE error:', error);
    return NextResponse.json(
      { error: 'Chyba pri mazaní tagu', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}
