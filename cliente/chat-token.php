<?php
/**
 * Esto representa el BACKEND del portal externo (solo el chat del cliente).
 * Es el único lugar de todo este demo que conoce PORTAL_API_KEY -- el
 * navegador nunca la ve.
 *
 * En un sistema real, la sesión ($_SESSION['ruc']) ya existe de antes
 * (el usuario inició sesión hace rato en su portal). Como esta es una demo
 * sin login de verdad, el primer POST "siembra" la sesión con lo que
 * escriben en el formulario -- de ahí en adelante, cualquier llamada
 * (incluso sin body) reutiliza esa misma sesión, igual que en producción.
 */

session_start();
header('Content-Type: application/json');

$coreApiInternalUrl = getenv('CORE_API_INTERNAL_URL') ?: 'http://core-api:3002/api/v1';
$coreApiPublicUrl = getenv('CORE_API_PUBLIC_URL') ?: 'http://localhost:3002/api/v1';
$wsPublicUrl = getenv('WS_PUBLIC_URL') ?: 'http://localhost:3001';
$portalApiKey = getenv('PORTAL_API_KEY');

if (!$portalApiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'Falta configurar PORTAL_API_KEY en el .env']);
    exit;
}

// ---------------------------------------------------------------------
// "Login" simulado: solo para esta demo. Un portal real ya tiene la
// sesión activa desde antes -- acá el POST inicial de la pantalla hace
// las veces de eso.
// ---------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!empty($input['externalCustomerId'])) {
        $_SESSION['ruc'] = $input['externalCustomerId'];
        $_SESSION['razon_social'] = $input['displayName'] ?? '';
    }
}

// ---------------------------------------------------------------------
// 1. Identidad: sale de la sesión YA autenticada, nunca del request.
// ---------------------------------------------------------------------
if (empty($_SESSION['ruc'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No hay sesión activa']);
    exit;
}

// ---------------------------------------------------------------------
// 2. Pedir el accessToken de cliente para ese RUC.
// ---------------------------------------------------------------------
$body = json_encode([
    'externalCustomerId' => $_SESSION['ruc'],
    'displayName' => $_SESSION['razon_social'] ?? '',
], JSON_THROW_ON_ERROR);

$ch = curl_init($coreApiInternalUrl . '/integration/chat-sessions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $portalApiKey,
    ],
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
if ($httpCode !== 200) {
    http_response_code($httpCode);
    echo $response;
    exit;
}

$session = json_decode($response, true);

// ---------------------------------------------------------------------
// 3. Al navegador SOLO le llega esto.
// ---------------------------------------------------------------------
echo json_encode([
    'accessToken' => $session['accessToken'],
    'expiresIn' => $session['expiresIn'],
    'conversationId' => $session['conversationId'],
    'coreApiUrl' => $coreApiPublicUrl,
    'wsPublicUrl' => $wsPublicUrl,
]);
