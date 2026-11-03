export default function handler(_req, res) {
  res.status(200).json({ status: 'ok', service: 'staler-call-server', time: new Date().toISOString() });
}
