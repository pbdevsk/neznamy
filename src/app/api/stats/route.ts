import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    try {
      // Získanie základných štatistík
      const [ownersResult, tagsResult, territoriesResult] = await Promise.all([
        client.query('SELECT COUNT(*) as count FROM owners'),
        client.query('SELECT COUNT(*) as count FROM owner_tags'),
        client.query('SELECT COUNT(DISTINCT katastralne_uzemie) as count FROM owners')
      ]);

      const stats = {
        owners: parseInt(ownersResult.rows[0].count),
        tags: parseInt(tagsResult.rows[0].count),
        territories: parseInt(territoriesResult.rows[0].count)
      };

      return NextResponse.json(stats);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítaní štatistík' },
      { status: 500 }
    );
  }
}
