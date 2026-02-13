const express = require('express');
const app = express();
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
require('dotenv').config();

app.use(cors());
app.use(express.json());

// calcul distance
app.post('/calculate', async (req,res) => {
    const {from,to} = req.body;
    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params:{origins:from, destinations:to, key:process.env.GOOGLE_MAPS_KEY, units:'metric'}
        });
        const distanceMeters = response.data.rows[0].elements[0].distance.value;
        const distanceKm = distanceMeters/1000;
        let price = distanceKm*1.1;
        if(price<200) price=200;
        res.json({distanceKm, price});
    } catch(err){ console.error(err); res.status(500).send('Erreur distance'); }
});

// Stripe PaymentIntent
app.post('/create-payment-intent', async (req,res) => {
    const {amount,email} = req.body;
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount*100), currency:'eur', receipt_email:email
        });
        res.json({clientSecret: paymentIntent.client_secret});
    } catch(err){ console.error(err); res.status(500).send('Erreur Stripe'); }
});

// Email + PDF
const transporter = nodemailer.createTransport({
    service:'gmail', auth:{user:process.env.EMAIL_USER, pass:process.env.EMAIL_PASS}
});
app.post('/confirm-payment', async (req,res) => {
    const {from,to,date,vehicle,name,email,amount} = req.body;
    const doc = new PDFDocument();
    const filePath = `factures/facture_${Date.now()}.pdf`;
    if(!fs.existsSync('factures')) fs.mkdirSync('factures');
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(20).text("Rym'Cars - Facture",{align:'center'});
    doc.moveDown();
    doc.fontSize(14).text(`Client : ${name}`);
    doc.text(`Email : ${email}`);
    doc.text(`Trajet : ${from} → ${to}`);
    doc.text(`Date : ${date}`);
    doc.text(`Véhicule : ${vehicle}`);
    doc.text(`Prix : ${amount.toFixed(2)} €`);
    doc.end();
    const mailOptions = {
        from:process.env.EMAIL_USER,
        to:email,
        subject:"Confirmation réservation Rym'Cars",
        text:`Bonjour ${name},
Merci pour votre réservation. Facture en pièce jointe.`,
        attachments:[{filename:'facture.pdf', path:filePath}]
    };
    transporter.sendMail(mailOptions,(err,info) => {
        if(err){ console.error(err); res.status(500).send('Erreur email'); }
        else res.json({message:'Paiement confirmé et email envoyé'});
    });
});

app.listen(3000,()=>console.log('Backend RymCars sur http://localhost:3000'));