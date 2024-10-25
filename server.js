const express = require('express');
const app = express();
const port = 8080;

app.set('view engine', 'ejs');

app.use(express.static('public'));

app.get('/', function (req, res) {
  const testimonials = [
    { name: 'John Doe', message: 'I love this product!', rating: 5 },
    { name: 'Jane Smith', message: 'Great service, highly recommend.', rating: 4 },
    { name: 'Samuel Lee', message: 'Satisfied with the experience.', rating: 4 }
  ];
  res.render('pages/index', { title: 'RetroTech Vault', testimonials: testimonials });
});

app.get('/login', function (req, res) {
  res.render('pages/login');
});

app.get('/register', function (req, res) {
  res.render('pages/register');
});

app.get('/shop', function (req, res) {
  const products = [
    {
      name: 'Super Nintendo Entertainment System',
      price: 69.99,
      image: 'snes.jpg',
      description: "Classic 16-bit console with iconic games like Super Mario World, Zelda, and Street Fighter II. Perfect for retro gaming enthusiasts.",
      rating: 4,
      number_of_ratings: 12,
      isBestSeller: true
    },
    {
      name: 'Sony Walkman',
      price: 39.99,
      image: 'walkman.webp',
      description: "Portable cassette player that defined music on the go in the 80s and 90s. Enjoy nostalgia with every track.",
      rating: 3,
      number_of_ratings: 6,
      isBestSeller: false
    },
    {
      name: 'Polaroid Camera',
      price: 99.99,
      image: 'polaroid.webp',
      description: "Instant camera for capturing memories with a vintage touch. Produces tangible prints instantly to relive precious moments.",
      rating: 5,
      number_of_ratings: 9,
      isBestSeller: true
    },
    {
      name: 'Sega Genesis',
      price: 59.99,
      image: 'genesis.jpg',
      description: "Popular 16-bit console featuring classic games like Sonic the Hedgehog and Streets of Rage. A must-have for retro game lovers.",
      rating: 4,
      number_of_ratings: 5,
      isBestSeller: false
    }
  ];
  res.render('pages/shop', { products: products });
});

app.get('/test', function (req, res) {
  res.render('pages/test');
})

app.get('*', function(req, res){
  res.render('pages/not_found');
});

app.listen(port);
console.log(`Server is listening on port http://localhost:${port}`);