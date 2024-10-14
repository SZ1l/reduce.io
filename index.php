<?php 
  session_start(); 

  if (!isset($_SESSION['username'])) {
        $_SESSION['msg'] = "You must log in first";
        header('location: login.php');
  }
  if (isset($_GET['logout'])) {
        session_destroy();
        unset($_SESSION['username']);
        header("location: login.php");
  }
?>
<!DOCTYPE html> 
<html>
    <head>
        <title>REDUCE</title>
        <meta charset="utf-8">
        <meta name="keywords content=" program="">
        <link rel="stylesheet" href="listing.css">
    </head>
    <body>

    <h1>Offers for User</h1>

    <label for="userId">Enter User ID:</label>
    <input type="text" id="userId" placeholder="Enter user ID">
    <button id="fetchOffersBtn">Fetch Offers</button>

    <div id="offerList"></div>
    
    <script src="javas/main.js"></script>  


    
</body>
</html>
