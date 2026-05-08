import axios from 'axios';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '1h' });

async function run() {
  try {
    const res = await axios.get('http://localhost:5000/sessions?year=1&stream=CSE&week_start=2026-05-04', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(JSON.stringify(res.data.filter(s => s.is_custom), null, 2));
  } catch (err) {
    console.error(err.message);
  }
}
run();
