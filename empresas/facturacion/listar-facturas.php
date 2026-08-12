<?php
/**
 * Lee de vuelta el registro para pintarlo en SU propio front -- qué se
 * envió, a quién, si ya se marcó pagado (eso lo hace el personal de
 * soporte a mano, en el CRM, tras revisar el comprobante). Misma llave
 * que enviar-factura.php (mismo integrador, dos operaciones).
 */

header('Content-Type: application/json');

$coreApiInternalUrl = getenv('CORE_API_INTERNAL_URL') ?: 'http://core-api:3002/api/v1';
$empresasApiKey = getenv('EMPRESAS_API_KEY');

if (!$empresasApiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Falta configurar EMPRESAS_API_KEY en el .env']);
    exit;
}

$params = [];
if (!empty($_GET['externalCustomerId'])) $params['externalCustomerId'] = $_GET['externalCustomerId'];
if (!empty($_GET['status'])) $params['status'] = $_GET['status'];
$query = $params ? ('?' . http_build_query($params)) : '';

$ch = curl_init($coreApiInternalUrl . '/integration/invoices' . $query);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $empresasApiKey],
    CURLOPT_TIMEOUT => 10,
]);
$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Error conectando con Core API: ' . $curlError]);
    exit;
}

http_response_code($httpCode);
echo $response;
