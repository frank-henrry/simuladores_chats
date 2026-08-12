<?php
/**
 * Manda una factura APARTE del chat (no toca ninguna conversación) --
 * hallazgo real de revisión: mezclar facturación con la conversación no
 * dejaba gestionar todas las facturas juntas. Es OTRO integrador, distinto
 * del portal cliente -- llave propia (EMPRESAS_API_KEY), no PORTAL_API_KEY.
 */

require __DIR__ . '/pdf.php';

header('Content-Type: application/json');

$coreApiInternalUrl = getenv('CORE_API_INTERNAL_URL') ?: 'http://core-api:3002/api/v1';
$empresasApiKey = getenv('EMPRESAS_API_KEY');

if (!$empresasApiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Falta configurar EMPRESAS_API_KEY en el .env']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$externalCustomerId = $input['externalCustomerId'] ?? '';
$numeroFactura = $input['numeroFactura'] ?? '';
$razonSocial = $input['razonSocial'] ?? '';
$monto = (string)($input['monto'] ?? '0');
$moneda = $input['moneda'] ?? 'PEN';
$fechaVencimiento = $input['fechaVencimiento'] ?? '';

if (!$externalCustomerId || !$numeroFactura) {
    http_response_code(400);
    echo json_encode(['error' => 'externalCustomerId y numeroFactura son requeridos']);
    exit;
}

$pdfContent = construirPdfFactura($numeroFactura, $razonSocial, $monto, $moneda, $fechaVencimiento);
$tmpFile = tempnam(sys_get_temp_dir(), 'factura_') . '.pdf';
file_put_contents($tmpFile, $pdfContent);

$postFields = [
    'externalCustomerId' => $externalCustomerId,
    'invoiceNumber' => $numeroFactura,
    'amount' => $monto,
    'currency' => $moneda,
    'dueDate' => $fechaVencimiento,
    'displayName' => $razonSocial,
    'file' => new CURLFile($tmpFile, 'application/pdf', "factura-$numeroFactura.pdf"),
];

$ch = curl_init($coreApiInternalUrl . '/integration/invoices');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields, // multipart/form-data automático por el CURLFile
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $empresasApiKey,
    ],
    CURLOPT_TIMEOUT => 15,
]);
$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
unlink($tmpFile);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Error conectando con Core API: ' . $curlError]);
    exit;
}
// 200 = ya existía esa factura para ese cliente (idempotente). 201 = nueva. Ambos son éxito.
if ($httpCode !== 200 && $httpCode !== 201) {
    http_response_code($httpCode);
    echo $response;
    exit;
}

$data = json_decode($response, true);
echo json_encode(['invoice' => $data['data']]);
