-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: May 02, 2026 at 03:31 AM
-- Server version: 8.0.30
-- PHP Version: 8.3.20

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `manok`
--

-- --------------------------------------------------------

--
-- Table structure for table `sales`
--

CREATE TABLE `sales` (
  `id` bigint UNSIGNED NOT NULL,
  `invoice_number` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` bigint UNSIGNED NOT NULL,
  `user_id` bigint UNSIGNED NOT NULL,
  `sale_date` date NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `tax` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL,
  `cash_collected` decimal(10,2) NOT NULL,
  `change_given` decimal(10,2) NOT NULL,
  `payment_method` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sales`
--

INSERT INTO `sales` (`id`, `invoice_number`, `branch_id`, `user_id`, `sale_date`, `subtotal`, `tax`, `total`, `cash_collected`, `change_given`, `payment_method`, `created_at`, `updated_at`) VALUES
(1, 'INV-20260501-0001', 1, 3, '2026-05-01', '250.00', '30.00', '280.00', '500.00', '220.00', 'cash', '2026-04-30 19:50:18', '2026-04-30 19:50:18'),
(2, 'INV-20260501-0002', 1, 2, '2026-05-01', '250.00', '30.00', '280.00', '500.00', '220.00', 'cash', '2026-04-30 19:51:44', '2026-04-30 19:51:44'),
(3, 'INV-20260501-0003', 1, 2, '2026-05-01', '2500.00', '300.00', '2800.00', '2500.00', '-300.00', 'cash', '2026-05-01 02:32:25', '2026-05-01 02:32:25'),
(4, 'INV-20260502-0004', 1, 3, '2026-05-02', '5000.00', '600.00', '5600.00', '5000.00', '-600.00', 'cash', '2026-05-01 18:51:26', '2026-05-01 18:51:26'),
(5, 'INV-20260502-0005', 1, 3, '2026-05-02', '5600.00', '672.00', '6272.00', '56000.00', '49728.00', 'cash', '2026-05-01 18:52:20', '2026-05-01 18:52:20'),
(6, 'INV-20260502-0006', 1, 3, '2026-05-02', '2520.00', '302.40', '2822.40', '2600.00', '-222.40', 'cash', '2026-05-01 19:17:34', '2026-05-01 19:17:34'),
(7, 'INV-20260502-0007', 1, 3, '2026-05-02', '7500.00', '900.00', '8400.00', '7500.00', '-900.00', 'cash', '2026-05-01 19:18:52', '2026-05-01 19:18:52');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `sales`
--
ALTER TABLE `sales`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `sales_invoice_number_unique` (`invoice_number`),
  ADD KEY `sales_branch_id_foreign` (`branch_id`),
  ADD KEY `sales_user_id_foreign` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `sales`
--
ALTER TABLE `sales`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `sales`
--
ALTER TABLE `sales`
  ADD CONSTRAINT `sales_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `sales_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
