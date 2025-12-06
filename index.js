import express from 'express'
const app = express()
const port = 3000

app.get('/card', async (req, res) => {
  try {
    const data = await fetch('http://localhost:4000/card');
    const response = await data.json();
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
