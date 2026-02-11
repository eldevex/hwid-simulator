<?php
/**
 * CONFIGURATION
 */
$my_secret_seed = "Fixed_Device_V1_2026"; // Ключ для HWID

/**
 * CHECK URL PARAMETER
 */
if (empty($_GET['url'])) {
    header("HTTP/1.1 400 Bad Request");
    die("Ошибка: не указана ссылка на подписку.");
}

$subscription_url = urldecode($_GET['url']);
$hwid = substr(hash('sha256', $my_secret_seed), 0, 16);

$headers = [
    "User-Agent: HiddifyNext/1.5.0 (Windows NT 10.0; Win64; x64)",
    "X-Hwid: " . $hwid,
    "X-Device-Id: " . $hwid,
    "Accept: */*",
    "Connection: close"
];

$options = [
    "http" => [
        "method" => "GET",
        "header" => implode("\r\n", $headers),
        "follow_location" => 1,
        "timeout" => 20,
        "ignore_errors" => true
    ],
    "ssl" => [
        "verify_peer" => false,
        "verify_peer_name" => false,
    ]
];

$context = stream_context_create($options);
$response = @file_get_contents($subscription_url, false, $context);

if ($response === FALSE) {
    header("HTTP/1.1 500 Internal Server Error");
    die("Ошибка: не удалось подключиться к серверу подписки.");
}

/**
 * DECODING LOGIC
 */
$decoded = base64_decode($response, true);
if ($decoded !== false && strpos($decoded, '://') !== false) {
    $output = $decoded;
} else {
    $output = $response;
}

if (strpos($output, 'Limit of devices reached') !== false) {
    header("Content-Type: text/plain; charset=utf-8");
    die("SERVER ERROR: Лимит устройств исчерпан.");
}

/**
 * REMOVE LINES STARTING WITH #
 */
$lines = explode("\n", $output);
$filtered_lines = array_filter($lines, function($line) {
    return !empty($line) && strpos(trim($line), '#') !== 0;
});
$output = implode("\n", $filtered_lines);

/**
 * OUTPUT RAW CONFIGURATION
 */
header("Content-Type: text/plain; charset=utf-8");
echo $output;
?>