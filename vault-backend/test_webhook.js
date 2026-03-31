const axios = require('axios');
axios.post('http://localhost:3000/api/access', { status: 'ACCESS GRANTED', flag: '1' })
  .then(res => console.log('✅ Webhook Response:', res.status, res.data))
  .catch(err => console.error('❌ Webhook Error:', err.message));
