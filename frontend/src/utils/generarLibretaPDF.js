import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Función auxiliar para agregar Paginación
const agregarPaginacion = (doc) => {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }
};

export const generarLibretaPDF = (prestamo, movimientos, calculos) => {
    if (!prestamo) {
        alert("No hay datos para generar el PDF.");
        return;
    }

    const doc = new jsPDF();

    // Encabezado principal
    doc.setFontSize(22);
    doc.setTextColor(245, 158, 11);
    doc.text("ANUBIS", 14, 20);

    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Estado de Cuenta - Libreta Abierta", 14, 28);

    // Datos del Cliente y Préstamo
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Cliente: ${prestamo.clientes?.nombre || 'Sin nombre'}`, 14, 35);

    const isFrecuenciaPorDias = prestamo.frecuencia?.startsWith('dias_');
    const modalidad = isFrecuenciaPorDias ? `Interés (${prestamo.frecuencia.split('_')[1]} Días)` : 'Mensual (Interés)';

    doc.text(`Fecha de Inicio: ${prestamo.fecha_inicio}`, 14, 41);
    doc.text(`Modalidad: ${modalidad}`, 14, 47);

    doc.setFontSize(11);
    doc.setTextColor(22, 163, 74); // Verde oscuro para el capital actual
    doc.text(`Capital Activo (Deuda Neta): $${parseFloat(prestamo.monto_capital).toFixed(2)}`, 14, 54);

    // Separador visual
    doc.setDrawColor(230, 230, 230);
    doc.line(14, 58, 196, 58);

    // Resumen de Intereses
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("Resumen de Interés:", 14, 65);

    doc.setFontSize(9);
    doc.text(`Generado a la fecha: $${calculos.generado.toFixed(2)}`, 14, 71);
    doc.text(`Pagado por cliente: $${calculos.pagado.toFixed(2)}`, 14, 76);
    if (calculos.ajustes !== 0) {
        doc.text(`Ajustes / Negociación: $${Math.abs(calculos.ajustes).toFixed(2)}`, 14, 81);
    }

    // Interés Pendiente
    doc.setFontSize(11);
    if (calculos.pendiente > 0) {
        doc.setTextColor(220, 38, 38); // Rojo
        doc.text(`Interés Pendiente de Pago: $${calculos.pendiente.toFixed(2)}`, 110, 71);
    } else {
        doc.setTextColor(22, 163, 74); // Verde
        doc.text(`Interés Pendiente de Pago: $0.00`, 110, 71);
    }

    // Tabla de Movimientos
    const startYTabla = calculos.ajustes !== 0 ? 90 : 85;

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text("Historial de Movimientos:", 14, startYTabla - 3);

    const tableColumn = ["Fecha", "Tipo de Movimiento", "Monto ($)", "Notas"];
    const tableRows = [];

    // Mapeamos los movimientos para que sean legibles en el PDF
    const formatTipo = (tipo) => {
        switch (tipo) {
            case 'corte_mes': return 'Inicio / Corte';
            case 'pago_interes': return 'Pago de Interés';
            case 'abono_capital': return 'Abono a Capital';
            case 'ajuste_interes': return 'Ajuste / Negociación';
            default: return tipo;
        }
    };

    movimientos.forEach((m) => {
        tableRows.push([
            m.fecha,
            formatTipo(m.tipo),
            `$${parseFloat(m.monto).toFixed(2)}`,
            m.notas || 'Sin notas'
        ]);
    });

    if (tableRows.length === 0) {
        tableRows.push(["-", "Sin movimientos registrados", "-", "-"]);
    }

    autoTable(doc, {
        startY: startYTabla,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 3 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 35 },
            2: { cellWidth: 25, fontStyle: 'bold' },
            3: { cellWidth: 'auto' }
        },
        didParseCell: function (data) {
            if (data.section === 'body' && tableRows.length > 0 && tableRows[0][1] !== "Sin movimientos registrados") {
                const tipoRaw = data.row.raw[1];
                if (data.column.index === 1 || data.column.index === 2) {
                    if (tipoRaw === 'Pago de Interés') data.cell.styles.textColor = [22, 163, 74];
                    else if (tipoRaw === 'Abono a Capital') data.cell.styles.textColor = [217, 119, 6];
                    else if (tipoRaw === 'Ajuste / Negociación') data.cell.styles.textColor = [126, 34, 206];
                    else if (tipoRaw === 'Inicio / Corte') data.cell.styles.textColor = [37, 99, 235];
                }
            }
        }
    });

    agregarPaginacion(doc);
    doc.save(`Libreta_${prestamo.clientes?.nombre?.replace(/\s+/g, '_')}_${prestamo.fecha_inicio}.pdf`);
};