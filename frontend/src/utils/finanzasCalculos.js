/**
 * Calcula el estado de capital y ganancia de un préstamo de Cuota Fija
 * bajo la regla blindada: primero se recupera el 100% del capital prestado
 * (que regresa a Caja Disponible) y solo el excedente cuenta como ganancia real.
 */
export function calcularEstadoCapitalCuotaFija(prestamo, cuotas = []) {
    const montoTotal = Number(prestamo?.monto_total || 0);
    const interesOriginal = Math.max(0, Number(prestamo?.interes_total || 0));
    const capitalOriginal =
        prestamo?.monto_capital !== undefined && prestamo?.monto_capital !== null
            ? Math.max(0, Number(prestamo.monto_capital))
            : Math.max(0, montoTotal - interesOriginal);

    const cuotasPagadas = cuotas.filter(c => c.estado_cobro === 'pagado');
    const cuotasRenovadas = cuotas.filter(c => c.estado_cobro === 'renovado');

    const dineroRecaudadoEfectivo = cuotasPagadas.reduce(
        (sum, c) => sum + Number(c.monto_recibido || prestamo?.valor_cuota || 0),
        0
    );
    const montoCruceRenovacion = cuotasRenovadas.reduce(
        (sum, c) => sum + Number(c.monto_recibido || prestamo?.valor_cuota || 0),
        0
    );

    const totalLiquidado = dineroRecaudadoEfectivo + montoCruceRenovacion;

    const capitalRecuperado = Math.min(capitalOriginal, totalLiquidado);
    const capitalEnCalle = prestamo?.estado === 'activo'
        ? Math.max(0, capitalOriginal - totalLiquidado)
        : 0;
    const gananciaRealizada = Math.max(0, totalLiquidado - capitalOriginal);
    const gananciaPendiente = prestamo?.estado === 'activo'
        ? Math.max(0, interesOriginal - gananciaRealizada)
        : 0;

    return {
        capitalOriginal,
        interesOriginal,
        dineroRecaudado: dineroRecaudadoEfectivo,
        montoCruceRenovacion,
        totalLiquidado,
        capitalRecuperado,
        capitalEnCalle,
        gananciaRealizada,
        gananciaPendiente
    };
}

/**
 * Ordena cronológicamente las cuotas liquidadas ('pagado' y 'renovado') de un préstamo fijo
 * y determina qué porción cubrió capital (Caja) y qué porción se convirtió en ganancia real.
 */
export function desglosarPagosCuotaFija(prestamo, cuotas = []) {
    const montoTotal = Number(prestamo?.monto_total || 0);
    const interesOriginal = Math.max(0, Number(prestamo?.interes_total || 0));
    const capitalOriginal =
        prestamo?.monto_capital !== undefined && prestamo?.monto_capital !== null
            ? Math.max(0, Number(prestamo.monto_capital))
            : Math.max(0, montoTotal - interesOriginal);

    const liquidadasOrdenadas = cuotas
        .filter(c => c.estado_cobro === 'pagado' || c.estado_cobro === 'renovado')
        .sort((a, b) => {
            const fechaA = a.fecha_pago_real || a.fecha_cobro || '';
            const fechaB = b.fecha_pago_real || b.fecha_cobro || '';
            if (fechaA !== fechaB) return fechaA.localeCompare(fechaB);
            if (a.estado_cobro !== b.estado_cobro) {
                return a.estado_cobro === 'pagado' ? -1 : 1;
            }
            return (a.fecha_cobro || '').localeCompare(b.fecha_cobro || '');
        });

    let acumulado = 0;

    return liquidadasOrdenadas.map(c => {
        const monto = Number(c.monto_recibido || prestamo?.valor_cuota || 0);
        const fechaEfectiva = c.fecha_pago_real || c.fecha_cobro;
        const esRenovacion = c.estado_cobro === 'renovado';
        const prevAcum = acumulado;
        acumulado += monto;

        const parteGanancia = Math.max(0, acumulado - Math.max(capitalOriginal, prevAcum));
        const parteCapital = Math.max(0, monto - parteGanancia);

        return {
            id: c.id,
            prestamoId: prestamo.id,
            fecha: fechaEfectiva,
            monto,
            parteCapital,
            parteGanancia,
            esRenovacion
        };
    });
}