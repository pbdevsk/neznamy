import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT DISTINCT katastralne_uzemie
        FROM owners
        ORDER BY katastralne_uzemie ASC
      `;

      const result = await client.query(query);
      
      const territories = result.rows.map(row => row.katastralne_uzemie);

      return NextResponse.json(territories);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Territories error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní katastrálnych území', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

