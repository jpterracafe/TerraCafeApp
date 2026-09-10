import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { getSupabase } from '@/lib/supabase';
import env from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawContent = formData.get('csvContent') as string | null;

    let csvText = '';
    if (file) {
      csvText = await file.text();
    } else if (rawContent) {
      csvText = rawContent;
    } else {
      return NextResponse.json({ error: 'Nenhum arquivo ou conteúdo CSV enviado.' }, { status: 400 });
    }

    // Parse CSV com PapaParse
    const parsed = Papa.parse<Record<string, any>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toUpperCase(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json(
        { error: 'Erro ao processar o formato do CSV', details: parsed.errors },
        { status: 400 }
      );
    }

    const rows = parsed.data;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'O arquivo CSV está vazio.' }, { status: 400 });
    }

    const normalizedRecords = rows.map((row) => {
      const idRaw = row['ID'] || row['CODIGO'] || row['ID_PROJETO'] || row['ID_FASE'] || row['IDFIREBIRD'];
      const nome = row['NOME'] || row['PROJETO'] || row['DESCRICAO'] || row['TITULO'] || row['FASE'] || 'Projeto Sem Nome';
      const status = row['STATUS'] || row['SITUACAO'] || row['ESTADO'] || 'Em Andamento';
      const responsavel = row['RESPONSAVEL'] || row['OPERADOR'] || row['TECNICO'] || row['GESTOR'] || null;
      const dataInicioRaw = row['DATA_INICIO'] || row['DATA'] || row['CRIADO_EM'] || null;
      const areaTotalRaw = row['AREA_TOTAL'] || row['AREA'] || row['HECTARES'] || null;

      const idFirebird = idRaw ? parseInt(String(idRaw).replace(/\D/g, ''), 10) || null : null;
      const areaTotal = areaTotalRaw ? parseFloat(String(areaTotalRaw).replace(',', '.')) || null : null;

      let dataInicio: string | null = null;
      if (dataInicioRaw) {
        const parsedDate = new Date(dataInicioRaw);
        if (!isNaN(parsedDate.getTime())) {
          dataInicio = parsedDate.toISOString();
        }
      }

      return {
        id_firebird: idFirebird,
        nome: String(nome).trim(),
        status: status ? String(status).trim() : null,
        responsavel: responsavel ? String(responsavel).trim() : null,
        data_inicio: dataInicio,
        area_total: areaTotal,
        ultima_sincronizacao: new Date().toISOString(),
      };
    });

    let savedCount = 0;
    let errorsCount = 0;

    const isDbConfigured = Boolean(
      env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (isDbConfigured) {
      const db = getSupabase();
      for (const record of normalizedRecords) {
        try {
          if (record.id_firebird) {
            const { error } = await db
              .from('projetos_irrigacao')
              .upsert(record, { onConflict: 'id_firebird' });
            if (error) throw error;
          } else {
            const { error } = await db
              .from('projetos_irrigacao')
              .insert(record);
            if (error) throw error;
          }
          savedCount++;
        } catch (dbErr) {
          console.error('Erro ao salvar registro:', dbErr);
          errorsCount++;
        }
      }
    } else {
      savedCount = normalizedRecords.length;
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      savedCount,
      errorsCount,
      isDbConfigured,
      records: normalizedRecords,
      message: isDbConfigured
        ? `${savedCount} registros sincronizados diretamente no banco de dados.`
        : `${savedCount} registros processados com sucesso (modo prévia/local).`,
    });
  } catch (error: any) {
    console.error('Erro na rota de importação:', error);
    return NextResponse.json(
      { error: 'Falha interna ao processar importação.', details: error?.message },
      { status: 500 }
    );
  }
}
