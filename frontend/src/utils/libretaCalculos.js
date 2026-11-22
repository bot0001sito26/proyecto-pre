// ----------------------------------------------------
// FUNCIONES ESTRICTAS EN UTC PARA EVITAR SALTOS DE DÍAS
// ----------------------------------------------------
export const sumarDias = (fechaBaseStr, dias) => {
    const [a, m, d] = fechaBaseStr.split('-').map(Number);
    const fecha = new Date(Date.UTC(a, m - 1, d));
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return fecha.toISOString().split('T')[0];
};

export const sumarMesesPreservandoDia = (fechaBaseStr, mesesAMultiplicar) => {
    const [anioIni, mesIni, diaIni] = fechaBaseStr.split('-').map(Number);
    const fechaDestino = new Date(Date.UTC(anioIni, mesIni - 1 + mesesAMultiplicar, 1));
    const anioDestino = fechaDestino.getUTCFullYear();
    const mesDestino = fechaDestino.getUTCMonth();
    const ultimoDia = new Date(Date.UTC(anioDestino, mesDestino + 1, 0)).getUTCDate();
    const diaEfectivo = Math.min(diaIni, ultimoDia);
    return `${anioDestino}-${String(mesDestino + 1).padStart(2, '0')}-${String(diaEfectivo).padStart(2, '0')}`;
};

export const obtenerInfoFrecuencia = (frecuencia) => {
    const isFrecuenciaPorDias = Boolean(frecuencia?.startsWith('dias_'));
    const diasFrecuencia = isFrecuenciaPorDias ? parseInt(frecuencia.split('_')[1], 10) : 30;
    const isPersonalizado = isFrecuenciaPorDias && frecuencia !== 'dias_7' && frecuencia !== 'dias_15';

    let cortesPorMes = 1;
    if (frecuencia === 'dias_7') cortesPorMes = 4;
    else if (frecuencia === 'dias_15') cortesPorMes = 2;

    let textoFrecuencia = frecuencia || '';
    if (frecuencia === 'mensual') textoFrecuencia = 'Mensual (Mes a Mes)';
    else if (frecuencia === 'dias_7') textoFrecuencia = 'Semanal (7 Días)';
    else if (frecuencia === 'dias_15') textoFrecuencia = 'Quincenal (15 Días)';
    else if (isPersonalizado) textoFrecuencia = `Especial (${diasFrecuencia} Días)`;

    return {
        isFrecuenciaPorDias,
        diasFrecuencia,
        isPersonalizado,
        cortesPorMes,
        textoFrecuencia
    };
};

export const calcularEstadoLibreta = ({ fechaInicio, montoTotal, hoyStr, frecuencia, movimientos }) => {
    const capitalOriginal = parseFloat(montoTotal || 0);
    const abonosTotales = movimientos
        .filter(m => m.tipo === 'abono_capital')
        .reduce((sum, m) => sum + parseFloat(m.monto), 0);
    const capitalActualEnVivo = Math.max(0, capitalOriginal - abonosTotales);

    if (!fechaInicio) {
        return {
            capitalActualEnVivo,
            cortes: 0,
            generado: 0,
            pagado: 0,
            ajustes: 0,
            pendiente: 0,
            proximoCorte: '',
            cronograma: [],
            mesesAgrupados: []
        };
    }

    const { isFrecuenciaPorDias, diasFrecuencia, cortesPorMes } = obtenerInfoFrecuencia(frecuencia);
    const cortesParaRecalcular = Math.max(1, Math.round(cortesPorMes));

    let generado = 0;
    let cortesTranscurridos = 0;
    let proximoCorteStr = '';
    const cronogramaPlano = [];
    const mesesAgrupados = [];

    const obtenerCapitalEnFecha = (fechaInicioBloque) => {
        const abonosHastaEsaFecha = movimientos
            .filter(m => m.tipo === 'abono_capital' && m.fecha <= fechaInicioBloque)
            .reduce((sum, m) => sum + parseFloat(m.monto), 0);
        return Math.max(0, capitalOriginal - abonosHastaEsaFecha);
    };

    let capitalDelBloqueActual = capitalOriginal;
    let interesEsteCorte = (capitalDelBloqueActual * 0.20) / cortesPorMes;
    let fechaInicioMesLogico = fechaInicio;

    let mesActualIndex = 1;
    let cortesDelMesActual = [];

    const empaquetarMes = (forzar = false) => {
        if (cortesDelMesActual.length > 0 || forzar) {
            mesesAgrupados.push({
                mesNumero: mesActualIndex,
                capitalBase: capitalDelBloqueActual,
                cortes: [...cortesDelMesActual]
            });
            mesActualIndex++;
            cortesDelMesActual = [];
        }
    };

    // Un corte se hace efectivo al finalizar su día (medianoche), por eso usamos < hoyStr
    if (isFrecuenciaPorDias) {
        let iteracionCorte = 1;
        let fechaCorteEfectiva = sumarDias(fechaInicio, diasFrecuencia);

        while (fechaCorteEfectiva < hoyStr) {
            if ((iteracionCorte - 1) % cortesParaRecalcular === 0) {
                if (iteracionCorte > 1) empaquetarMes();
                capitalDelBloqueActual = obtenerCapitalEnFecha(fechaInicioMesLogico);
                interesEsteCorte = (capitalDelBloqueActual * 0.20) / cortesPorMes;
            }

            generado += interesEsteCorte;
            cortesTranscurridos++;

            const corteObj = {
                numeroGlobal: cortesTranscurridos,
                numeroLocal: cortesDelMesActual.length + 1,
                fecha: fechaCorteEfectiva,
                estado: 'pasado',
                interesGenerado: interesEsteCorte
            };

            cronogramaPlano.push(corteObj);
            cortesDelMesActual.push(corteObj);

            if (iteracionCorte % cortesParaRecalcular === 0) {
                fechaInicioMesLogico = fechaCorteEfectiva;
            }

            iteracionCorte++;
            fechaCorteEfectiva = sumarDias(fechaInicio, diasFrecuencia * iteracionCorte);
        }

        proximoCorteStr = fechaCorteEfectiva;

        if ((iteracionCorte - 1) % cortesParaRecalcular === 0) {
            if (iteracionCorte > 1) empaquetarMes();
            capitalDelBloqueActual = obtenerCapitalEnFecha(fechaInicioMesLogico);
            interesEsteCorte = (capitalDelBloqueActual * 0.20) / cortesPorMes;
        }

        const proximoCorteObj = {
            numeroGlobal: cortesTranscurridos + 1,
            numeroLocal: cortesDelMesActual.length + 1,
            fecha: proximoCorteStr,
            estado: 'proximo',
            interesGenerado: interesEsteCorte
        };
        cronogramaPlano.push(proximoCorteObj);
        cortesDelMesActual.push(proximoCorteObj);
        empaquetarMes(true);
    } else {
        let iteracionCorte = 1;
        let fechaCorteEfectiva = sumarMesesPreservandoDia(fechaInicio, iteracionCorte);

        while (fechaCorteEfectiva < hoyStr) {
            capitalDelBloqueActual = obtenerCapitalEnFecha(fechaInicioMesLogico);
            interesEsteCorte = (capitalDelBloqueActual * 0.20) / cortesPorMes;

            generado += interesEsteCorte;
            cortesTranscurridos++;

            const corteObj = {
                numeroGlobal: cortesTranscurridos,
                numeroLocal: 1,
                fecha: fechaCorteEfectiva,
                estado: 'pasado',
                interesGenerado: interesEsteCorte
            };

            cronogramaPlano.push(corteObj);
            cortesDelMesActual.push(corteObj);
            empaquetarMes();

            fechaInicioMesLogico = fechaCorteEfectiva;
            iteracionCorte++;
            fechaCorteEfectiva = sumarMesesPreservandoDia(fechaInicio, iteracionCorte);
        }

        proximoCorteStr = fechaCorteEfectiva;

        capitalDelBloqueActual = obtenerCapitalEnFecha(fechaInicioMesLogico);
        interesEsteCorte = (capitalDelBloqueActual * 0.20) / cortesPorMes;

        const proximoCorteObj = {
            numeroGlobal: cortesTranscurridos + 1,
            numeroLocal: 1,
            fecha: proximoCorteStr,
            estado: 'proximo',
            interesGenerado: interesEsteCorte
        };
        cronogramaPlano.push(proximoCorteObj);
        cortesDelMesActual.push(proximoCorteObj);
        empaquetarMes(true);
    }

    const pagado = movimientos.filter(m => m.tipo === 'pago_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);
    const ajustes = movimientos.filter(m => m.tipo === 'ajuste_interes').reduce((sum, m) => sum + parseFloat(m.monto), 0);
    const pendiente = Math.max(0, generado - pagado - ajustes);

    return {
        capitalActualEnVivo,
        cortes: cortesTranscurridos,
        generado,
        pagado,
        ajustes,
        pendiente,
        proximoCorte: proximoCorteStr,
        cronograma: cronogramaPlano,
        mesesAgrupados
    };
};