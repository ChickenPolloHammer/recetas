export default function handler(req, res) {
  // Solo GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Vercel inyecta las variables de entorno aquí en servidor
  // Nunca se exponen en el código del cliente
  res.status(200).json({
    token:    process.env.GITHUB_TOKEN    || '',
    user:     process.env.GITHUB_USER     || '',
    repo:     process.env.GITHUB_REPO     || '',
    password: process.env.ADMIN_PASSWORD  || ''
  });
}
