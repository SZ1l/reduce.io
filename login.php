<?php include('server.php') ?>
<!DOCTYPE html>
<html>
<head>
  <title>Registration system PHP and MySQL</title>
  <link rel="stylesheet" type="text/css" href="style.css">
</head>
<body>
  
         
  <form method="post" action="login.php">
        <?php include('errors.php'); ?>
        <body>
        <div class="wrapper">
           <h1>Login</h1>
            <form action="register.php" method="post"><div class="inputbox">
               <input type="text" oninput="onputlog()" placeholder="login" name="username" required>
               <i class='bx bxs-user'></i>
               </div>
            <div class="inputbox">
               <input type="password" oninput="onputpass()" placeholder="password" name="password" required>
               <i class='bx bx-lock-alt'></i>
               </div>
                <button type="submit" class="btn">Войти</button></form>
            <div class="register-link"><p>Do you not register?<a href="register.html">REGISTER</a></p>
            <a href="">Забыли пароль?</a>
            </div>
        </div>
    </body>
  </form>
</body>
</html>