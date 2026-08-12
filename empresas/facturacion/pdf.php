<?php
/**
 * Arma un PDF real y válido (no un archivo de mentira con la extensión
 * cambiada): el Core valida la firma real de los primeros bytes
 * (fileValidation.js), así que un ".pdf" que no sea PDF de verdad rebota
 * con 415. Los offsets del xref se calculan en código en vez de a mano,
 * para que siga siendo válido sin importar cuánto texto tenga la factura.
 */
function construirPdfFactura(string $numeroFactura, string $razonSocial, string $monto, string $moneda, string $fechaVencimiento): string
{
    $sanitize = fn($s) => str_replace(['(', ')', '\\'], '', $s);
    $lines = [
        'Factura ' . $sanitize($numeroFactura),
        'Cliente: ' . $sanitize($razonSocial),
        'Monto: ' . $sanitize($moneda) . ' ' . $sanitize($monto),
        'Vence: ' . $sanitize($fechaVencimiento),
    ];

    $contentStream = '';
    foreach ($lines as $i => $line) {
        $y = 160 - $i * 24;
        $contentStream .= "BT /F1 14 Tf 20 $y Td ($line) Tj ET\n";
    }

    $objects = [
        1 => "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        2 => "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        3 => "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        4 => "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        5 => "5 0 obj\n<< /Length " . strlen($contentStream) . " >>\nstream\n{$contentStream}endstream\nendobj\n",
    ];

    $pdf = "%PDF-1.4\n";
    $offsets = [];
    for ($i = 1; $i <= 5; $i++) {
        $offsets[$i] = strlen($pdf);
        $pdf .= $objects[$i];
    }

    $xrefStart = strlen($pdf);
    $xref = "xref\n0 6\n0000000000 65535 f \n";
    for ($i = 1; $i <= 5; $i++) {
        $xref .= str_pad((string)$offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
    }
    $pdf .= $xref;
    $pdf .= "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n$xrefStart\n%%EOF";

    return $pdf;
}
